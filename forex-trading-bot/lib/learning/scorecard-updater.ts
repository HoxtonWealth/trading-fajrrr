import { supabase } from '@/lib/services/supabase'

/**
 * Scorecard Updater — SQL-based, no LLM needed.
 *
 * Aggregates closed trades into per-agent per-instrument scorecards.
 * Phase 1: only agent is 'technical_trend'.
 */
export async function updateScorecards(): Promise<{ updated: number }> {
  // Get all closed trades grouped by strategy and instrument
  const { data: trades, error } = await supabase
    .from('trades')
    .select('instrument, strategy, pnl')
    .eq('status', 'closed')
    .not('pnl', 'is', null)

  if (error) {
    throw new Error(`Failed to fetch closed trades: ${error.message}`)
  }

  if (!trades || trades.length === 0) {
    return { updated: 0 }
  }

  // Aggregate by agent (strategy) + instrument
  const aggregates = new Map<string, {
    agent: string
    instrument: string
    total: number
    wins: number
    losses: number
    totalPnl: number
  }>()

  for (const trade of trades) {
    const agent = trade.strategy === 'trend' ? 'technical_trend' : `technical_${trade.strategy}`
    const key = `${agent}:${trade.instrument}`

    if (!aggregates.has(key)) {
      aggregates.set(key, {
        agent,
        instrument: trade.instrument,
        total: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
      })
    }

    const agg = aggregates.get(key)!
    agg.total++
    agg.totalPnl += trade.pnl
    if (trade.pnl > 0) {
      agg.wins++
    } else {
      agg.losses++
    }
  }

  // Upsert scorecards
  let updated = 0
  for (const agg of aggregates.values()) {
    const winRate = agg.total > 0 ? agg.wins / agg.total : 0
    const avgPnl = agg.total > 0 ? agg.totalPnl / agg.total : 0

    const { error: upsertError } = await supabase
      .from('agent_scorecards')
      .upsert({
        agent: agg.agent,
        instrument: agg.instrument,
        total_trades: agg.total,
        wins: agg.wins,
        losses: agg.losses,
        win_rate: winRate,
        avg_pnl: avgPnl,
        total_pnl: agg.totalPnl,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'agent,instrument' })

    if (upsertError) {
      throw new Error(`Failed to upsert scorecard for ${agg.agent}/${agg.instrument}: ${upsertError.message}`)
    }
    updated++
  }

  return { updated }
}
