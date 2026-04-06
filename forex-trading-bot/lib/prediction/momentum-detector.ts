import { supabase } from '@/lib/services/supabase'

/**
 * Momentum Detector — Blueprint Section 6.
 *
 * Fires when probability velocity > 0.02/hr AND acceleration has same sign.
 * Looks at 6-hour window of snapshots.
 */
export async function detectMomentumSignals(): Promise<Array<{
  marketId: string
  description: string
  strength: number
  velocity: number
  direction: 'bullish' | 'bearish'
  instruments: string[]
}>> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  const { data: markets } = await supabase
    .from('pm_markets')
    .select('id, title, instruments')
    .eq('active', true)

  if (!markets) return []

  const signals = []

  for (const market of markets) {
    const { data: snapshots } = await supabase
      .from('pm_snapshots')
      .select('probability, velocity, acceleration, created_at')
      .eq('market_id', market.id)
      .gte('created_at', sixHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!snapshots || snapshots.length === 0) continue

    const latest = snapshots[0]
    if (latest.velocity === null || latest.acceleration === null) continue

    const absVelocity = Math.abs(latest.velocity)
    const sameSign = (latest.velocity > 0 && latest.acceleration > 0) ||
                     (latest.velocity < 0 && latest.acceleration < 0)

    if (absVelocity > 0.005 && sameSign) {
      const strength = Math.min(1.0, absVelocity / 0.03) // Normalize: 0.03/hr = strength 1.0

      signals.push({
        marketId: market.id,
        description: `${market.title}: probability moving ${latest.velocity > 0 ? 'up' : 'down'} at ${(absVelocity * 100).toFixed(1)}%/hr with acceleration`,
        strength,
        velocity: latest.velocity,
        direction: latest.velocity > 0 ? 'bullish' as const : 'bearish' as const,
        instruments: market.instruments,
      })
    }
  }

  return signals
}
