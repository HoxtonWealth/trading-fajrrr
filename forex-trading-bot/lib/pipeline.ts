import { supabase } from '@/lib/services/supabase'
import { evaluateTrendFollowing, IndicatorSnapshot } from '@/lib/strategies/trend-following'
import { evaluateMeanReversion, MeanRevSnapshot } from '@/lib/strategies/mean-reversion'
import { detectRegime } from '@/lib/strategies/regime-detector'
import { calculatePositionSize } from '@/lib/risk/position-sizer'
import { runPreTradeChecks, PreTradeContext } from '@/lib/risk/pre-trade-checks'
import { pearsonCorrelation } from '@/lib/risk/correlation'
import { runAgentPipeline } from '@/lib/agent-pipeline'
import { STOP_MULTIPLIER_TREND, STOP_MULTIPLIER_MEAN_REV } from '@/lib/risk/constants'
import { TradeRow } from '@/lib/types/database'

export interface PipelineResult {
  action: 'open_trade' | 'close_trade' | 'none'
  instrument: string
  details: string
  trade?: Partial<TradeRow>
}

/**
 * Multi-strategy pipeline with regime detection.
 *
 * 1. Read latest 2 indicator rows for instrument
 * 2. Detect regime (trending / ranging / transition)
 * 3. Run appropriate strategy(ies)
 * 4. If entry signal → calculate position size (adjusted for regime)
 * 5. Run all 8 pre-trade checks (with correlation)
 * 6. If all pass → insert trade
 * 7. If exit signal → close open trade
 */
export async function runPipeline(instrument: string): Promise<PipelineResult> {
  // 0. Check system state — block new entries during weekend mode
  const { data: weekendState } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'weekend_mode')
    .single()

  const isWeekendMode = weekendState?.value === 'true'

  // 1. Read latest 2 indicator rows
  const { data: indicatorRows, error: indError } = await supabase
    .from('indicators')
    .select('*')
    .eq('instrument', instrument)
    .eq('granularity', 'H4')
    .order('time', { ascending: false })
    .limit(2)

  if (indError) {
    throw new Error(`Failed to read indicators: ${indError.message}`)
  }

  if (!indicatorRows || indicatorRows.length < 2) {
    return { action: 'none', instrument, details: 'Not enough indicator data (need at least 2 rows)' }
  }

  // Get actual close price from candles
  const { data: latestCandle } = await supabase
    .from('candles')
    .select('close')
    .eq('instrument', instrument)
    .eq('granularity', 'H4')
    .order('time', { ascending: false })
    .limit(1)
    .single()

  const closePrice = latestCandle?.close ?? indicatorRows[0].ema_20

  // Check for open trades on this instrument
  const { data: openTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('instrument', instrument)
    .in('status', ['open', 'pending'])

  const hasOpenLong = openTrades?.some((t: TradeRow) => t.direction === 'long') ?? false
  const hasOpenShort = openTrades?.some((t: TradeRow) => t.direction === 'short') ?? false

  // 2. Detect regime
  const regime = detectRegime(indicatorRows[0].adx_14)

  // 2b. Run agent pipeline for entry decisions (agents don't handle exits)
  let agentSignal: 'long' | 'short' | 'hold' = 'hold'
  let agentConfidence = 0
  try {
    const agentResult = await runAgentPipeline(instrument, {
      ema_20: indicatorRows[0].ema_20,
      ema_50: indicatorRows[0].ema_50,
      adx_14: indicatorRows[0].adx_14,
      atr_14: indicatorRows[0].atr_14,
      rsi_14: indicatorRows[0].rsi_14,
      bb_upper: indicatorRows[0].bb_upper,
      bb_middle: indicatorRows[0].bb_middle,
      bb_lower: indicatorRows[0].bb_lower,
      close: closePrice,
    })
    agentSignal = agentResult.decision.decision
    agentConfidence = agentResult.decision.confidence
  } catch (error) {
    console.error(`[pipeline] Agent pipeline failed for ${instrument}, using technical-only:`, error)
  }

  // 3. Run appropriate strategies based on regime
  let bestSignal: { signal: 'long' | 'short' | 'none'; stopLoss: number | null; exitSignal: boolean; exitReason: string | null; strategy: 'trend' | 'mean_reversion' } = {
    signal: 'none', stopLoss: null, exitSignal: false, exitReason: null, strategy: 'trend',
  }

  for (const strategyName of regime.strategies) {
    if (strategyName === 'trend') {
      const current: IndicatorSnapshot = {
        ema_20: indicatorRows[0].ema_20,
        ema_50: indicatorRows[0].ema_50,
        adx_14: indicatorRows[0].adx_14,
        atr_14: indicatorRows[0].atr_14,
        close: closePrice,
      }
      const previous: IndicatorSnapshot = {
        ema_20: indicatorRows[1].ema_20,
        ema_50: indicatorRows[1].ema_50,
        adx_14: indicatorRows[1].adx_14,
        atr_14: indicatorRows[1].atr_14,
        close: indicatorRows[1].ema_20,
      }
      const trendSignal = evaluateTrendFollowing(current, previous, hasOpenLong, hasOpenShort)
      if (trendSignal.signal !== 'none' || trendSignal.exitSignal) {
        bestSignal = { ...trendSignal, strategy: 'trend' }
      }
    }

    if (strategyName === 'mean_reversion') {
      const row = indicatorRows[0]
      if (row.rsi_14 != null && row.bb_upper != null && row.bb_middle != null && row.bb_lower != null) {
        const mrSnapshot: MeanRevSnapshot = {
          rsi_14: row.rsi_14,
          adx_14: row.adx_14,
          atr_14: row.atr_14,
          bb_upper: row.bb_upper,
          bb_middle: row.bb_middle,
          bb_lower: row.bb_lower,
          close: closePrice,
        }
        const mrSignal = evaluateMeanReversion(mrSnapshot, hasOpenLong, hasOpenShort)
        if (mrSignal.signal !== 'none' || mrSignal.exitSignal) {
          bestSignal = { ...mrSignal, strategy: 'mean_reversion' }
        }
      }
    }
  }

  // If agents have a high-confidence signal, use it for entries (overrides technical)
  if (agentConfidence >= 0.4 && agentSignal !== 'hold' && !bestSignal.exitSignal) {
    const stopMultiplierForAgent = bestSignal.strategy === 'mean_reversion' ? STOP_MULTIPLIER_MEAN_REV : STOP_MULTIPLIER_TREND
    const atr = indicatorRows[0].atr_14
    bestSignal = {
      signal: agentSignal === 'long' ? 'long' : 'short',
      stopLoss: agentSignal === 'long' ? closePrice - atr * stopMultiplierForAgent : closePrice + atr * stopMultiplierForAgent,
      exitSignal: false,
      exitReason: null,
      strategy: regime.strategies[0],
    }
  }

  // --- Handle exit signal ---
  if (bestSignal.exitSignal && openTrades && openTrades.length > 0) {
    const tradeToClose = openTrades[0]
    const { error: closeError } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: bestSignal.exitReason,
      })
      .eq('id', tradeToClose.id)

    if (closeError) {
      throw new Error(`Failed to close trade: ${closeError.message}`)
    }

    return {
      action: 'close_trade',
      instrument,
      details: `Closed trade ${tradeToClose.id} [${regime.regime}]: ${bestSignal.exitReason}`,
    }
  }

  // --- Handle entry signal ---
  if (bestSignal.signal === 'none') {
    return { action: 'none', instrument, details: `No signal [regime: ${regime.regime}]` }
  }

  if (isWeekendMode) {
    return { action: 'none', instrument, details: 'Weekend mode — new entries blocked' }
  }

  if (hasOpenLong || hasOpenShort) {
    return { action: 'none', instrument, details: 'Already have an open position' }
  }

  // 4. Calculate position size
  const { data: equitySnapshot } = await supabase
    .from('equity_snapshots')
    .select('equity, daily_pnl')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const equity = equitySnapshot?.equity ?? 0
  if (equity <= 0) {
    return { action: 'none', instrument, details: 'No equity data available' }
  }

  const stopMultiplier = bestSignal.strategy === 'trend' ? STOP_MULTIPLIER_TREND : STOP_MULTIPLIER_MEAN_REV

  const positionSize = calculatePositionSize({
    equity,
    atr: indicatorRows[0].atr_14,
    stopMultiplier,
    close: closePrice,
  })

  // Apply regime size multiplier
  let adjustedUnits = Math.floor(positionSize.units * regime.sizeMultiplier)

  if (adjustedUnits <= 0) {
    return { action: 'none', instrument, details: 'Position size calculated as 0 after regime adjustment' }
  }

  // 4b. Apply sentiment modifier (never overrides signals, only adjusts size)
  const { data: latestSentiment } = await supabase
    .from('news_sentiment')
    .select('score')
    .eq('instrument', instrument)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (latestSentiment) {
    const sentimentScore = latestSentiment.score
    const isLong = bestSignal.signal === 'long'
    const isShort = bestSignal.signal === 'short'

    // Sentiment opposes direction → skip trade
    if ((isLong && sentimentScore < -0.5) || (isShort && sentimentScore > 0.5)) {
      return {
        action: 'none',
        instrument,
        details: `Sentiment opposes ${bestSignal.signal} (score=${sentimentScore.toFixed(2)}), skipping`,
      }
    }

    // Sentiment supports direction → boost size by 25%
    if ((isLong && sentimentScore > 0.5) || (isShort && sentimentScore < -0.5)) {
      adjustedUnits = Math.floor(adjustedUnits * 1.25)
    }
  }

  // 5. Build correlation map for pre-trade checks
  const { data: allOpenTrades } = await supabase
    .from('trades')
    .select('instrument')
    .in('status', ['open', 'pending'])

  const openInstruments = allOpenTrades?.map(t => t.instrument) ?? []
  const correlations: Record<string, number> = {}

  // Compute correlation with each open instrument's close prices
  for (const openInst of [...new Set(openInstruments)]) {
    if (openInst === instrument) continue
    const { data: closesA } = await supabase
      .from('candles')
      .select('close')
      .eq('instrument', instrument)
      .eq('granularity', 'H4')
      .order('time', { ascending: false })
      .limit(20)

    const { data: closesB } = await supabase
      .from('candles')
      .select('close')
      .eq('instrument', openInst)
      .eq('granularity', 'H4')
      .order('time', { ascending: false })
      .limit(20)

    if (closesA && closesB && closesA.length >= 3 && closesB.length >= 3) {
      const seriesA = closesA.map(c => c.close).reverse()
      const seriesB = closesB.map(c => c.close).reverse()
      correlations[openInst] = pearsonCorrelation(seriesA, seriesB)
    }
  }

  const { data: todayTrades } = await supabase
    .from('trades')
    .select('id')
    .gte('opened_at', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString())

  const dailyPnlPercent = equitySnapshot
    ? equitySnapshot.daily_pnl / equity
    : 0

  const preTradeCtx: PreTradeContext = {
    riskPercent: positionSize.riskPercent,
    instrument,
    units: adjustedUnits,
    entryPrice: closePrice,
    leverage: (adjustedUnits * closePrice) / equity,
    dailyTradeCount: todayTrades?.length ?? 0,
    openPositionCount: allOpenTrades?.length ?? 0,
    openInstruments,
    correlations,
    currentSpread: 0,
    averageSpread: 1,
    dailyPnlPercent,
  }

  const preTradeResult = runPreTradeChecks(preTradeCtx)

  if (!preTradeResult.pass) {
    const failures = preTradeResult.checks
      .filter(c => !c.pass)
      .map(c => c.reason)
      .join('; ')
    return { action: 'none', instrument, details: `Pre-trade check failed: ${failures}` }
  }

  // 6. Insert pending trade
  const newTrade = {
    instrument,
    direction: bestSignal.signal,
    strategy: bestSignal.strategy,
    entry_price: closePrice,
    stop_loss: bestSignal.stopLoss!,
    units: adjustedUnits,
    risk_percent: positionSize.riskPercent,
    status: 'pending' as const,
    opened_at: new Date().toISOString(),
  }

  const { error: insertError } = await supabase
    .from('trades')
    .insert(newTrade)

  if (insertError) {
    throw new Error(`Failed to insert trade: ${insertError.message}`)
  }

  return {
    action: 'open_trade',
    instrument,
    details: `${bestSignal.signal.toUpperCase()} ${instrument} [${regime.regime}/${bestSignal.strategy}]: ${adjustedUnits} units, stop ${bestSignal.stopLoss!.toFixed(2)}, risk ${(positionSize.riskPercent * 100).toFixed(1)}%`,
    trade: newTrade,
  }
}
