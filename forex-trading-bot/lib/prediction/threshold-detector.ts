import { supabase } from '@/lib/services/supabase'

const THRESHOLDS = [0.50, 0.70, 0.90]
const PROXIMITY_PCT = 0.03 // Fire when within 3% of a threshold

/**
 * Threshold Detector — Blueprint Section 6.
 *
 * Fires when probability crosses OR is within 3% of a 50%, 70%, or 90% boundary.
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

    if (!snapshots || snapshots.length === 0) continue

    const current = snapshots[0].probability

    for (const threshold of THRESHOLDS) {
      // Crossing detection (needs 2 snapshots)
      if (snapshots.length >= 2) {
        const previous = snapshots[1].probability
        const crossedUp = previous < threshold && current >= threshold
        const crossedDown = previous >= threshold && current < threshold

        if (crossedUp || crossedDown) {
          signals.push({
            marketId: market.id,
            description: `${market.title} crossed ${(threshold * 100).toFixed(0)}% ${crossedUp ? 'upward' : 'downward'} (now ${(current * 100).toFixed(1)}%)`,
            strength: threshold,
            threshold,
            crossDirection: crossedUp ? 'up' as const : 'down' as const,
            direction: crossedUp ? 'bullish' as const : 'bearish' as const,
            instruments: market.instruments,
          })
          continue // Don't also emit proximity for same threshold
        }
      }

      // Proximity detection — market is near a key level
      const distance = Math.abs(current - threshold)
      if (distance <= PROXIMITY_PCT) {
        const approaching = current < threshold ? 'up' : 'down'
        const strength = 0.4 + (1 - distance / PROXIMITY_PCT) * 0.2 // 0.4–0.6 based on closeness

        signals.push({
          marketId: market.id,
          description: `${market.title} near ${(threshold * 100).toFixed(0)}% (at ${(current * 100).toFixed(1)}%)`,
          strength,
          threshold,
          crossDirection: approaching as 'up' | 'down',
          direction: current >= 0.5 ? 'bullish' as const : 'bearish' as const,
          instruments: market.instruments,
        })
      }
    }
  }

  return signals
}
