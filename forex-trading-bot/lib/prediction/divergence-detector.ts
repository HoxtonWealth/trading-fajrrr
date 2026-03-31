import { supabase } from '@/lib/services/supabase'

/**
 * Divergence Detector — Blueprint Section 6.
 *
 * Fires when |Kalshi_prob - comparable_indicator| > 10 percentage points.
 * Compares Kalshi markets against Polymarket equivalents.
 */
export async function detectDivergenceSignals(): Promise<Array<{
  marketId: string
  description: string
  strength: number
  gap: number
  direction: 'bullish' | 'bearish'
  instruments: string[]
}>> {
  // Get latest snapshots for paired markets (same category, different platforms)
  const { data: markets } = await supabase
    .from('pm_markets')
    .select('id, platform, title, category, instruments')
    .eq('active', true)

  if (!markets) return []

  // Group by category
  const byCategory = new Map<string, typeof markets>()
  for (const m of markets) {
    const list = byCategory.get(m.category) ?? []
    list.push(m)
    byCategory.set(m.category, list)
  }

  const signals = []

  for (const [category, categoryMarkets] of byCategory) {
    if (categoryMarkets.length < 2) continue

    // Get latest probability for each
    const probs = new Map<string, { prob: number; market: typeof categoryMarkets[0] }>()

    for (const m of categoryMarkets) {
      const { data: snap } = await supabase
        .from('pm_snapshots')
        .select('probability')
        .eq('market_id', m.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (snap) {
        probs.set(m.id, { prob: snap.probability, market: m })
      }
    }

    // Compare pairs
    const entries = [...probs.values()]
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const gap = Math.abs(entries[i].prob - entries[j].prob)
        if (gap > 0.10) { // > 10 percentage points
          const allInstruments = [...new Set([...entries[i].market.instruments, ...entries[j].market.instruments])]
          const strength = Math.min(1.0, gap / 0.20) // 20pt gap = strength 1.0

          signals.push({
            marketId: entries[i].market.id,
            description: `${category} divergence: ${entries[i].market.title} (${(entries[i].prob * 100).toFixed(0)}%) vs ${entries[j].market.title} (${(entries[j].prob * 100).toFixed(0)}%) = ${(gap * 100).toFixed(0)}pt gap`,
            strength,
            gap,
            direction: entries[i].prob > entries[j].prob ? 'bullish' as const : 'bearish' as const,
            instruments: allInstruments,
          })
        }
      }
    }
  }

  return signals
}
