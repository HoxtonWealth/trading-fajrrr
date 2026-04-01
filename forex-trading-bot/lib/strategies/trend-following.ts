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
 * Entry:
 *   - Long: EMA(20) crosses above EMA(50) AND ADX(14) > 25
 *   - Short: EMA(20) crosses below EMA(50) AND ADX(14) > 25
 *
 * Exit:
 *   - EMA crossover reversal
 *   - ADX drops below 20
 *   - Trailing stop hit (handled externally)
 *
 * Stop: 2x ATR(14) trailing stop
 */
export function evaluateTrendFollowing(
  current: IndicatorSnapshot,
  previous: IndicatorSnapshot,
  hasOpenLong: boolean,
  hasOpenShort: boolean,
): TrendSignal {
  const ADX_ENTRY_THRESHOLD = 20
  const ADX_EXIT_THRESHOLD = 15

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
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'adx_below_15' }
    }
  }

  if (hasOpenShort) {
    if (crossedAbove) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'ema_crossover_reversal' }
    }
    if (current.adx_14 < ADX_EXIT_THRESHOLD) {
      return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'adx_below_15' }
    }
  }

  // --- Entry signals ---
  if (crossedAbove && current.adx_14 > ADX_ENTRY_THRESHOLD) {
    const stopLoss = current.close - current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'long', stopLoss, exitSignal: false, exitReason: null }
  }

  if (crossedBelow && current.adx_14 > ADX_ENTRY_THRESHOLD) {
    const stopLoss = current.close + current.atr_14 * STOP_MULTIPLIER_TREND
    return { signal: 'short', stopLoss, exitSignal: false, exitReason: null }
  }

  // No signal
  return { signal: 'none', stopLoss: null, exitSignal: false, exitReason: null }
}
