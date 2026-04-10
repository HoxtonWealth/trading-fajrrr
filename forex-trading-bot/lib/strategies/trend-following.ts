import { STOP_MULTIPLIER_TREND } from '@/lib/risk/constants'

export interface IndicatorSnapshot {
  ema_20: number
  ema_50: number
  adx_14: number
  atr_14: number
  close: number
}

export interface TrendSignal {
  signal: 'long' | 'short' | 'none'
  stopLoss: number | null
  exitSignal: boolean
  exitReason: string | null
}

/**
 * Trend Following Strategy — Blueprint Section 2, Layer 2a
 *
 * Entry (two modes):
 *   A. Crossover: EMA(20) crosses above/below EMA(50) AND ADX > 15
 *   B. Pullback: Established trend (EMA aligned + ADX > 20) AND price
 *      pulls back to EMA(20) zone (within 0.3% tolerance). Joins
 *      existing trends instead of waiting for rare crossovers.
 *
 * Exit:
 *   - EMA crossover reversal
 *   - ADX drops below 10
 *   - Trailing stop hit (handled externally)
 *
 * Stop: 2x ATR(14) from entry
 *
 * ── Tuning History ──────────────────────────────────────────
 * Blueprint:  ADX entry 25, exit 20, crossover only
 * 2026-04-01: ADX entry 20, exit 15 (loosened for learning)
 * 2026-04-03: ADX entry 15, exit 10 (funnel analysis: +133% signals)
 * 2026-04-09: Added pullback entries. Bot couldn't enter established
 *             trends — 10/12 instruments trending (ADX 27-37) but no
 *             crossovers for days. Pullback entries fill this gap:
 *             confirmed trend + price touching EMA(20) = entry.
 *             ADX threshold for pullbacks is 20 (higher than crossover's
 *             15) to ensure trend is well-established before joining.
 */
export function evaluateTrendFollowing(
  current: IndicatorSnapshot,
  previous: IndicatorSnapshot,
  hasOpenLong: boolean,
  hasOpenShort: boolean,
): TrendSignal {
  const ADX_ENTRY_THRESHOLD = 15
  const ADX_PULLBACK_THRESHOLD = 20 // Higher bar for pullback entries — trend must be strong
  const ADX_EXIT_THRESHOLD = 10
  const PULLBACK_TOLERANCE = 0.005 // Price within 0.5% of EMA(20) counts as "at EMA"

  const emaLongNow = current.ema_20 > current.ema_50
  const emaLongPrev = previous.ema_20 > previous.ema_50
  const emaShortNow = current.ema_20 < current.ema_50
  const emaShortPrev = previous.ema_20 < previous.ema_50

  const crossedAbove = emaLongNow && !emaLongPrev
  const crossedBelow = emaShortNow && !emaShortPrev

  // --- Exit signals ---
  if (hasOpenLong) {
    if (crossedBelow) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'ema_crossover_reversal' }
    }
    if (current.adx_14 < ADX_EXIT_THRESHOLD) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'adx_below_exit' }
    }
  }

  if (hasOpenShort) {
    if (crossedAbove) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'ema_crossover_reversal' }
    }
    if (current.adx_14 < ADX_EXIT_THRESHOLD) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'adx_below_exit' }
    }
  }

  // --- Entry A: Crossover entries (original) ---
  if (crossedAbove && current.adx_14 > ADX_ENTRY_THRESHOLD) {
    const stopLoss = current.close - current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'long', stopLoss, exitSignal: false, exitReason: null }
  }

  if (crossedBelow && current.adx_14 > ADX_ENTRY_THRESHOLD) {
    const stopLoss = current.close + current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'short', stopLoss, exitSignal: false, exitReason: null }
  }

  // --- Entry B: Pullback entries (join established trends) ---
  // Uptrend pullback: EMAs aligned bullish + strong trend + price dipped to EMA(20)
  if (
    !hasOpenLong &&
    emaLongNow &&
    current.adx_14 > ADX_PULLBACK_THRESHOLD &&
    current.close <= current.ema_20 * (1 + PULLBACK_TOLERANCE) &&
    current.close >= current.ema_20 * (1 - PULLBACK_TOLERANCE) &&
    previous.close > previous.ema_20 // Was above EMA(20) last candle — confirming it's a pullback, not a breakdown
  ) {
    const stopLoss = current.close - current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'long', stopLoss, exitSignal: false, exitReason: null }
  }

  // Downtrend pullback: EMAs aligned bearish + strong trend + price rallied to EMA(20)
  if (
    !hasOpenShort &&
    emaShortNow &&
    current.adx_14 > ADX_PULLBACK_THRESHOLD &&
    current.close >= current.ema_20 * (1 - PULLBACK_TOLERANCE) &&
    current.close <= current.ema_20 * (1 + PULLBACK_TOLERANCE) &&
    previous.close < previous.ema_20 // Was below EMA(20) last candle — confirming it's a pullback, not a breakout
  ) {
    const stopLoss = current.close + current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'short', stopLoss, exitSignal: false, exitReason: null }
  }

  // No signal
  return { signal: 'none', stopLoss: null, exitSignal: false, exitReason: null }
}
