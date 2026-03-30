import { supabase } from '@/lib/services/supabase'
import { evaluateTrendFollowing, IndicatorSnapshot } from '@/lib/strategies/trend-following'
import { calculatePositionSize } from '@/lib/risk/position-sizer'
import { runPreTradeChecks, PreTradeContext } from '@/lib/risk/pre-trade-checks'
import { STOP_MULTIPLIER_TREND, INSTRUMENT_CLUSTERS } from '@/lib/risk/constants'
import { IndicatorRow, TradeRow } from '@/lib/types/database'

export interface PipelineResult {
  action: 'open_trade' | 'close_trade' | 'none'
  instrument: string
  details: string
  trade?: Partial<TradeRow>
}

/**
 * Simplified trading pipeline for Phase 1 (technical only, no LLM agents).
 *
 * 1. Read latest 2 indicator rows for instrument
 * 2. Run trend following strategy
 * 3. If entry signal → calculate position size
 * 4. Run all 8 pre-trade checks
 * 5. If all pass → insert trade with status 'pending'
 * 6. If exit signal → update open trade to status 'pending_close'
 */
export async function runPipeline(instrument: string): Promise<PipelineResult> {
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

  const current: IndicatorSnapshot = {
    ema_20: indicatorRows[0].ema_20,
    ema_50: indicatorRows[0].ema_50,
    adx_14: indicatorRows[0].adx_14,
    atr_14: indicatorRows[0].atr_14,
    close: indicatorRows[0].ema_20, // approximate — will use candle close in production
  }

  const previous: IndicatorSnapshot = {
    ema_20: indicatorRows[1].ema_20,
    ema_50: indicatorRows[1].ema_50,
    adx_14: indicatorRows[1].adx_14,
    atr_14: indicatorRows[1].atr_14,
    close: indicatorRows[1].ema_20,
  }

  // Get actual close price from candles for accurate sizing
  const { data: latestCandle } = await supabase
    .from('candles')
    .select('close')
    .eq('instrument', instrument)
    .eq('granularity', 'H4')
    .order('time', { ascending: false })
    .limit(1)
    .single()

  if (latestCandle) {
    current.close = latestCandle.close
  }

  // Check for open trades on this instrument
  const { data: openTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('instrument', instrument)
    .in('status', ['open', 'pending'])

  const hasOpenLong = openTrades?.some((t: TradeRow) => t.direction === 'long') ?? false
  const hasOpenShort = openTrades?.some((t: TradeRow) => t.direction === 'short') ?? false

  // 2. Run trend following strategy
  const signal = evaluateTrendFollowing(current, previous, hasOpenLong, hasOpenShort)

  // --- Handle exit signal ---
  if (signal.exitSignal && openTrades && openTrades.length > 0) {
    const tradeToClose = openTrades[0]
    const { error: closeError } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: signal.exitReason,
      })
      .eq('id', tradeToClose.id)

    if (closeError) {
      throw new Error(`Failed to close trade: ${closeError.message}`)
    }

    return {
      action: 'close_trade',
      instrument,
      details: `Closed trade ${tradeToClose.id}: ${signal.exitReason}`,
    }
  }

  // --- Handle entry signal ---
  if (signal.signal === 'none') {
    return { action: 'none', instrument, details: 'No entry signal' }
  }

  // Don't open if already have a position
  if (hasOpenLong || hasOpenShort) {
    return { action: 'none', instrument, details: 'Already have an open position' }
  }

  // 3. Calculate position size
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

  const positionSize = calculatePositionSize({
    equity,
    atr: current.atr_14,
    stopMultiplier: STOP_MULTIPLIER_TREND,
    close: current.close,
  })

  if (positionSize.units <= 0) {
    return { action: 'none', instrument, details: 'Position size calculated as 0' }
  }

  // 4. Run pre-trade checks
  const { data: allOpenTrades } = await supabase
    .from('trades')
    .select('instrument')
    .in('status', ['open', 'pending'])

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
    units: positionSize.units,
    entryPrice: current.close,
    leverage: (positionSize.units * current.close) / equity,
    dailyTradeCount: todayTrades?.length ?? 0,
    openPositionCount: allOpenTrades?.length ?? 0,
    openInstruments: allOpenTrades?.map(t => t.instrument) ?? [],
    correlations: {}, // Phase 1: single instrument, no correlation check needed
    currentSpread: 0, // Phase 1: not checking spread yet
    averageSpread: 1, // Avoids divide-by-zero
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

  // 5. Insert pending trade
  const units = signal.signal === 'short' ? -positionSize.units : positionSize.units

  const newTrade = {
    instrument,
    direction: signal.signal,
    strategy: 'trend' as const,
    entry_price: current.close,
    stop_loss: signal.stopLoss!,
    units: Math.abs(positionSize.units),
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
    details: `${signal.signal.toUpperCase()} ${instrument}: ${positionSize.units} units, stop ${signal.stopLoss!.toFixed(2)}, risk ${(positionSize.riskPercent * 100).toFixed(1)}%`,
    trade: newTrade,
  }
}
