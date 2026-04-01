import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { fetchMarketBySlug } from '@/lib/services/polymarket'
import { fetchKalshiSeries } from '@/lib/services/kalshi'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: markets } = await supabase
      .from('pm_markets')
      .select('*')
      .eq('active', true)

    if (!markets || markets.length === 0) {
      return NextResponse.json({ success: true, summary: 'No active markets to poll' })
    }

    let polled = 0
    let failed = 0

    for (const market of markets) {
      let probability: number | null = null
      let volume = 0

      try {
        if (market.platform === 'polymarket') {
          const data = await fetchMarketBySlug(market.external_id)
          if (data) {
            probability = data.probability
            volume = data.volume
          }
        } else if (market.platform === 'kalshi') {
          // Kalshi uses series tickers — fetch all markets in series, pick nearest upcoming
          const seriesMarkets = await fetchKalshiSeries(market.external_id)
          if (seriesMarkets.length > 0) {
            // Use the first market (nearest expiry) as the representative probability
            // Average the "above threshold" probabilities to get an implied rate expectation
            const avgProb = seriesMarkets.reduce((s, m) => s + m.probability, 0) / seriesMarkets.length
            probability = avgProb
            volume = seriesMarkets.reduce((s, m) => s + m.volume, 0)
          }
        }
      } catch (error) {
        console.error(`[poll-pm] Failed to poll ${market.platform}/${market.external_id}:`, error)
        failed++
        continue
      }

      if (probability === null) continue

      // Compute velocity from last 2 snapshots
      const { data: recentSnapshots } = await supabase
        .from('pm_snapshots')
        .select('probability, created_at')
        .eq('market_id', market.id)
        .order('created_at', { ascending: false })
        .limit(2)

      let velocity: number | null = null
      let acceleration: number | null = null

      if (recentSnapshots && recentSnapshots.length >= 1) {
        const prev = recentSnapshots[0]
        const timeDiffHours = (Date.now() - new Date(prev.created_at).getTime()) / (1000 * 60 * 60)
        if (timeDiffHours > 0) {
          velocity = (probability - prev.probability) / timeDiffHours
        }

        if (recentSnapshots.length >= 2) {
          const prevPrev = recentSnapshots[1]
          const prevTimeDiff = (new Date(prev.created_at).getTime() - new Date(prevPrev.created_at).getTime()) / (1000 * 60 * 60)
          if (prevTimeDiff > 0) {
            const prevVelocity = (prev.probability - prevPrev.probability) / prevTimeDiff
            if (velocity !== null) {
              acceleration = velocity - prevVelocity
            }
          }
        }
      }

      await supabase.from('pm_snapshots').insert({
        market_id: market.id,
        probability,
        volume,
        velocity,
        acceleration,
      })

      polled++
    }

    return NextResponse.json({
      success: true,
      summary: `Polled ${polled}/${markets.length} markets (${failed} failed)`,
    })
  } catch (error) {
    console.error('[cron/poll-prediction-markets] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
