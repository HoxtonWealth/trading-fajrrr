import { supabase } from '@/lib/services/supabase'

const THRESHOLDS = [0.50, 0.70, 0.90]

/**
 * Threshold Detector — Blueprint Section 6.
 *
 * Fires when probability crosses 50%, 70%, or 90% boundary.
 */
export async function detectThresholdSignals(): Promise<Array<{
  marketId: string
  description: string
  strength: number
  threshold: number
  crossDirection: 'up' | 'down'
  direction: 'bullish' | 'bearish'
  instruments: string[]
}>> {
  const { data: markets } = await supabase
    .from('pm_markets')
    .select('id, title, instruments')
    .eq('active', true)

  if (!markets) return []

  const signals = []

  for (const market of markets) {
    const { data: snapshots } = await supabase
      .from('pm_snapshots')
      .select('probability')
      .eq('market_id', market.id)
      .order('created_at', { ascending: false })
      .limit(2)

    if (!snapshots || snapshots.length < 2) continue

    const current = snapshots[0].probability
    const previous = snapshots[1].probability

    for (const threshold of THRESHOLDS) {
      const crossedUp = previous < threshold && current >= threshold
      const crossedDown = previous >= threshold && current < threshold

      if (crossedUp || crossedDown) {
        const strength = threshold // Higher threshold = stronger signal

        signals.push({
          marketId: market.id,
          description: `${market.title} crossed ${(threshold * 100).toFixed(0)}% ${crossedUp ? 'upward' : 'downward'} (now ${(current * 100).toFixed(1)}%)`,
          strength,
          threshold,
          crossDirection: crossedUp ? 'up' as const : 'down' as const,
          direction: crossedUp ? 'bullish' as const : 'bearish' as const,
          instruments: market.instruments,
        })
      }
    }
  }

  return signals
}
