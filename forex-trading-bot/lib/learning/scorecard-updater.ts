import { supabase } from '@/lib/services/supabase'
import { MIN_DARWINIAN_WEIGHT, MAX_DARWINIAN_WEIGHT } from '@/lib/risk/constants'

/**
 * Scorecard Updater — SQL-based + Darwinian weight adjustment.
 *
 * 1. Aggregates closed trades into per-agent per-instrument scorecards
 * 2. Computes accuracy from agent predictions
 * 3. Updates Darwinian weights (bounded 0.3–2.5)
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

  // Also aggregate from agent predictions
  const { data: predictions } = await supabase
    .from('trade_agent_predictions')
    .select('agent, instrument, predicted_signal, chief_decision, actual_outcome')
    .not('actual_outcome', 'is', null)

  const predictionAccuracy = new Map<string, { correct: number; total: number }>()
  if (predictions) {
    for (const pred of predictions) {
      const key = `${pred.agent}:${pred.instrument}`
      if (!predictionAccuracy.has(key)) {
        predictionAccuracy.set(key, { correct: 0, total: 0 })
      }
      const acc = predictionAccuracy.get(key)!
      acc.total++
      if (pred.predicted_signal === pred.actual_outcome) {
        acc.correct++
      }
    }
  }

  // Upsert scorecards with weights
  let updated = 0
  for (const agg of aggregates.values()) {
    const winRate = agg.total > 0 ? agg.wins / agg.total : 0
    const avgPnl = agg.total > 0 ? agg.totalPnl / agg.total : 0

    // Calculate Darwinian weight based on win rate
    // Weight = 1.0 + (winRate - 0.5) * 3.0, bounded [0.3, 2.5]
    let weight = 1.0 + (winRate - 0.5) * 3.0
    weight = Math.max(MIN_DARWINIAN_WEIGHT, Math.min(MAX_DARWINIAN_WEIGHT, weight))

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
        weight,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'agent,instrument' })

    if (upsertError) {
      throw new Error(`Failed to upsert scorecard for ${agg.agent}/${agg.instrument}: ${upsertError.message}`)
    }
    updated++
  }

  return { updated }
}
