import { supabase } from '@/lib/services/supabase'
import { MIN_DARWINIAN_WEIGHT, MAX_DARWINIAN_WEIGHT } from '@/lib/risk/constants'
import { extractPostMortem } from '@/lib/learning/post-mortem'

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
    // Map all strategies to 'technical' — both trend and mean_reversion
    // come from the technical analyst. Matches agent names used in the
    // pipeline: 'technical', 'sentiment', 'macro', 'regime'.
    const agent = 'technical'
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

  // Extract post-mortems for trades that don't have lessons yet
  const { data: tradesWithoutLessons } = await supabase
    .from('trades')
    .select('id, instrument, direction, strategy, entry_price, exit_price, pnl, opened_at, closed_at, close_reason')
    .eq('status', 'closed')
    .not('pnl', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(5)

  if (tradesWithoutLessons) {
    for (const trade of tradesWithoutLessons) {
      // Check if lesson already exists for this trade
      const { data: existing } = await supabase
        .from('trade_lessons')
        .select('id')
        .eq('trade_id', trade.id)
        .limit(1)

      if (!existing || existing.length === 0) {
        try {
          await extractPostMortem(trade as Parameters<typeof extractPostMortem>[0])
        } catch (err) {
          console.error(`[scorecard-updater] Post-mortem failed for trade ${trade.id}:`, err)
        }
      }
    }
  }

  // Backfill actual_outcome on predictions for closed trades.
  // Get full trade details (with opened_at/closed_at) for time-scoped matching.
  const { data: closedTrades } = await supabase
    .from('trades')
    .select('instrument, direction, opened_at, closed_at, pnl')
    .eq('status', 'closed')
    .not('pnl', 'is', null)

  if (closedTrades) {
    for (const trade of closedTrades) {
      if (!trade.opened_at || !trade.closed_at) continue

      // Outcome = the trade's actual direction (what happened in the market).
      // Agents that predicted this direction were correct, regardless of P&L.
      const actualOutcome = trade.direction // 'long' or 'short'

      // Scope update to predictions made around this trade's open time (±1 hour)
      const openTime = new Date(trade.opened_at)
      const windowStart = new Date(openTime.getTime() - 60 * 60 * 1000).toISOString()
      const windowEnd = new Date(openTime.getTime() + 60 * 60 * 1000).toISOString()

      await supabase
        .from('trade_agent_predictions')
        .update({ actual_outcome: actualOutcome })
        .eq('instrument', trade.instrument)
        .is('actual_outcome', null)
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
    }
  }

  // Aggregate from agent predictions (now with backfilled outcomes)
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

  // Upsert trade-based scorecards (technical agent)
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

  // Upsert prediction-based scorecards (sentiment, macro, regime agents)
  // These agents don't generate trades directly but their prediction accuracy
  // drives Darwinian weights used by the Chief Analyst.
  for (const [key, acc] of predictionAccuracy.entries()) {
    const [agent, instrument] = key.split(':')
    // Skip 'technical' — already covered by trade-based aggregation above
    if (agent === 'technical') continue

    const accuracy = acc.total > 0 ? acc.correct / acc.total : 0.5
    let weight = 1.0 + (accuracy - 0.5) * 3.0
    weight = Math.max(MIN_DARWINIAN_WEIGHT, Math.min(MAX_DARWINIAN_WEIGHT, weight))

    const { error: upsertError } = await supabase
      .from('agent_scorecards')
      .upsert({
        agent,
        instrument,
        total_trades: acc.total,
        wins: acc.correct,
        losses: acc.total - acc.correct,
        win_rate: accuracy,
        avg_pnl: 0,
        total_pnl: 0,
        weight,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'agent,instrument' })

    if (upsertError) {
      throw new Error(`Failed to upsert scorecard for ${agent}/${instrument}: ${upsertError.message}`)
    }
    updated++
  }

  return { updated }
}
