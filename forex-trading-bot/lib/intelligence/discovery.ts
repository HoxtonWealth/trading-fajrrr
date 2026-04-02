import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { alertCustom } from '@/lib/services/telegram'

const MIN_INSTRUMENTS = 3
const MAX_INSTRUMENTS = 12

interface DiscoveryAdd { instrument: string; reason: string; expected_regime?: string }
interface DiscoveryRemove { instrument: string; reason: string }
interface DiscoveryKeep { instrument: string; reason: string }

export interface DiscoveryResult {
  add: DiscoveryAdd[]
  remove: DiscoveryRemove[]
  keep: DiscoveryKeep[]
}

const FALLBACK: DiscoveryResult = { add: [], remove: [], keep: [] }

export function validateDiscoveryResult(result: DiscoveryResult, currentActive: string[]): DiscoveryResult {
  const activeCount = currentActive.length

  // Enforce min 3
  const allowedRemoves = Math.max(0, activeCount - MIN_INSTRUMENTS)
  const validRemoves = result.remove.slice(0, allowedRemoves)

  // Enforce max 12
  const remainingAfterRemoves = activeCount - validRemoves.length
  const allowedAdds = Math.max(0, MAX_INSTRUMENTS - remainingAfterRemoves)
  const validAdds = result.add.slice(0, allowedAdds)

  return {
    add: validAdds,
    remove: validRemoves,
    keep: result.keep,
  }
}

export async function runDiscovery(): Promise<{ added: string[]; removed: string[]; kept: string[] }> {
  // 1. Get current active instruments
  const { data: activeRows } = await supabase
    .from('instrument_universe')
    .select('instrument')
    .eq('status', 'active')

  const currentActive = activeRows?.map(r => r.instrument) ?? []

  // 2. Get performance stats
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('instrument, win_rate, total_trades, avg_pnl, total_pnl')

  const perfSummary = (scorecards ?? [])
    .reduce((acc, s) => {
      if (!acc[s.instrument]) acc[s.instrument] = { trades: 0, totalPnl: 0, winRate: 0 }
      acc[s.instrument].trades += s.total_trades
      acc[s.instrument].totalPnl += s.total_pnl ?? 0
      acc[s.instrument].winRate = s.win_rate
      return acc
    }, {} as Record<string, { trades: number; totalPnl: number; winRate: number }>)

  const perfContext = currentActive
    .map(i => {
      const p = perfSummary[i]
      return p
        ? `${i}: ${p.trades} trades, ${(p.winRate * 100).toFixed(0)}% win rate, $${p.totalPnl.toFixed(2)} P&L`
        : `${i}: no trades yet`
    })
    .join('\n')

  // 3. Ask LLM for recommendations
  let result: DiscoveryResult
  try {
    const response = await callLLM({
      tier: 'strong',
      systemPrompt: `You are a market research analyst for a forex trading bot. Recommend instrument changes for the coming week.

Output JSON:
{
  "add": [{"instrument": "SYMBOL", "reason": "why add", "expected_regime": "trending|ranging"}],
  "remove": [{"instrument": "SYMBOL", "reason": "why remove"}],
  "keep": [{"instrument": "SYMBOL", "reason": "why keep"}]
}

Use standard instrument format: BASE_QUOTE (e.g., EUR_USD, GBP_JPY, XAU_USD, US30_USD, BCO_USD).
Only suggest instruments tradeable on Capital.com.
Min 3, max 12 active instruments.
Output ONLY valid JSON, no markdown.`,
      userPrompt: `Current active instruments and performance:\n${perfContext}\n\nGiven current macro conditions, which instruments should we add, remove, or keep for this week? Consider central bank meetings, geopolitical events, volatility regimes, and our recent performance.`,
      maxTokens: 500,
    })

    result = parseLLMJson<DiscoveryResult>(response.content, FALLBACK)
  } catch {
    result = FALLBACK
  }

  // 4. Validate and apply constraints
  const validated = validateDiscoveryResult(result, currentActive)

  // 5. Check no open positions on instruments to remove
  const finalRemoves: string[] = []
  for (const r of validated.remove) {
    const { data: openTrades } = await supabase
      .from('trades')
      .select('id')
      .eq('instrument', r.instrument)
      .in('status', ['open', 'pending'])

    if (!openTrades || openTrades.length === 0) {
      await supabase
        .from('instrument_universe')
        .update({ status: 'removed', removed_reason: r.reason, updated_at: new Date().toISOString() })
        .eq('instrument', r.instrument)
        .eq('status', 'active')
      finalRemoves.push(r.instrument)
    }
  }

  // 6. Add new instruments
  const finalAdds: string[] = []
  for (const a of validated.add) {
    await supabase.from('instrument_universe').upsert({
      instrument: a.instrument,
      display_name: a.instrument.replace('_', '/'),
      asset_class: guessAssetClass(a.instrument),
      status: 'active',
      added_reason: a.reason,
      discovery_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'instrument' })
    finalAdds.push(a.instrument)
  }

  const kept = validated.keep.map(k => k.instrument)

  // 7. Send Telegram summary
  const lines: string[] = []
  if (finalAdds.length > 0) lines.push(`Added: ${finalAdds.join(', ')}`)
  if (finalRemoves.length > 0) lines.push(`Removed: ${finalRemoves.join(', ')}`)
  lines.push(`Keeping: ${kept.join(', ') || currentActive.join(', ')}`)

  alertCustom('Weekly Instrument Discovery', lines.join('\n')).catch(() => {})

  return { added: finalAdds, removed: finalRemoves, kept }
}

function guessAssetClass(instrument: string): string {
  if (instrument.startsWith('XAU') || instrument.startsWith('XAG')) return 'commodity'
  if (instrument.startsWith('BCO') || instrument.startsWith('WTI')) return 'commodity'
  if (instrument.startsWith('US30') || instrument.startsWith('SPX') || instrument.startsWith('NAS')) return 'index'
  return 'forex'
}
