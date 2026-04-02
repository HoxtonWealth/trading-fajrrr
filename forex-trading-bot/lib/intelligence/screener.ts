import { supabase } from '@/lib/services/supabase'

export interface ScreenerScores {
  volatility: number
  trend: number
  news_catalyst: number
  calendar_proximity: number
  historical_edge: number
  pm_signal: number
}

export interface ScreenerWeights {
  volatility: number
  trend: number
  news_catalyst: number
  calendar_proximity: number
  historical_edge: number
  pm_signal: number
}

export const DEFAULT_WEIGHTS: ScreenerWeights = {
  volatility: 0.2,
  trend: 0.25,
  news_catalyst: 0.15,
  calendar_proximity: 0.1,
  historical_edge: 0.2,
  pm_signal: 0.1,
}

const MIN_SCORE_THRESHOLD = 0.1

export function scoreInstrument(scores: ScreenerScores, weights: ScreenerWeights): number {
  return (
    scores.volatility * weights.volatility +
    scores.trend * weights.trend +
    scores.news_catalyst * weights.news_catalyst +
    scores.calendar_proximity * weights.calendar_proximity +
    scores.historical_edge * weights.historical_edge +
    scores.pm_signal * weights.pm_signal
  )
}

export function rankInstruments(
  items: Array<{ instrument: string; composite: number }>,
  maxN: number,
  minScore = MIN_SCORE_THRESHOLD
): Array<{ instrument: string; composite: number }> {
  return items
    .filter(i => i.composite >= minScore)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, maxN)
}

/**
 * Screen all active instruments and return ranked by composite score.
 * Pure data scoring — no LLM call needed.
 */
export async function screenInstruments(
  instruments: string[],
  maxPositions: number
): Promise<Array<{ instrument: string; composite: number; scores: ScreenerScores }>> {
  const results: Array<{ instrument: string; composite: number; scores: ScreenerScores }> = []

  for (const instrument of instruments) {
    const scores = await computeScores(instrument)
    const composite = scoreInstrument(scores, DEFAULT_WEIGHTS)
    results.push({ instrument, composite, scores })
  }

  const ranked = rankInstruments(
    results.map(r => ({ instrument: r.instrument, composite: r.composite })),
    maxPositions,
    MIN_SCORE_THRESHOLD
  )

  return results
    .filter(r => ranked.some(rk => rk.instrument === r.instrument))
    .sort((a, b) => b.composite - a.composite)
}

async function computeScores(instrument: string): Promise<ScreenerScores> {
  // 1. Volatility score — ATR percentile vs 30-day average
  const { data: indicators } = await supabase
    .from('indicators')
    .select('atr_14, adx_14, ema_20, ema_50')
    .eq('instrument', instrument)
    .eq('granularity', 'H4')
    .order('time', { ascending: false })
    .limit(30)

  let volatility = 0.5
  let trend = 0.5

  if (indicators && indicators.length >= 2) {
    const currentATR = indicators[0].atr_14
    const avgATR = indicators.reduce((s, r) => s + r.atr_14, 0) / indicators.length
    volatility = avgATR > 0 ? Math.min(1, currentATR / avgATR) : 0.5

    // Trend score — ADX strength + EMA alignment
    const adx = indicators[0].adx_14
    const emaAligned = indicators[0].ema_20 !== indicators[0].ema_50 ? 1 : 0
    trend = Math.min(1, (adx / 50) * 0.7 + emaAligned * 0.3)
  }

  // 2. News catalyst score
  const { data: sentiment } = await supabase
    .from('news_sentiment')
    .select('headline_count, score')
    .eq('instrument', instrument)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const news_catalyst = sentiment
    ? Math.min(1, (sentiment.headline_count / 10) * 0.5 + Math.abs(sentiment.score) * 0.5)
    : 0

  // 3. Calendar proximity
  const now = new Date().toISOString()
  const fourHoursLater = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('economic_events')
    .select('impact')
    .gte('event_time', now)
    .lte('event_time', fourHoursLater)

  const calendar_proximity = events && events.length > 0
    ? Math.min(1, events.filter(e => e.impact === 'high').length * 0.5 + events.length * 0.1)
    : 0

  // 4. Historical edge
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('win_rate, total_trades')
    .eq('instrument', instrument)

  let historical_edge = 0.5
  if (scorecards && scorecards.length > 0) {
    const totalTrades = scorecards.reduce((s, r) => s + r.total_trades, 0)
    const avgWinRate = scorecards.reduce((s, r) => s + r.win_rate, 0) / scorecards.length
    historical_edge = Math.min(1, avgWinRate * 0.7 + Math.min(1, totalTrades / 20) * 0.3)
  }

  // 5. PM signal score
  const { data: signals } = await supabase
    .from('prediction_signals')
    .select('strength')
    .eq('status', 'active')

  const pm_signal = signals && signals.length > 0
    ? Math.min(1, signals.reduce((s, r) => s + r.strength, 0) / signals.length)
    : 0

  return { volatility, trend, news_catalyst, calendar_proximity, historical_edge, pm_signal }
}
