import { STOP_MULTIPLIER_MEAN_REV } from '@/lib/risk/constants'

export interface MeanRevSnapshot {
  rsi_14: number
  adx_14: number
  atr_14: number
  bb_upper: number
  bb_middle: number
  bb_lower: number
  close: number
}

export interface MeanRevSignal {
  signal: 'long' | 'short' | 'none'
  stopLoss: number | null
  exitSignal: boolean
  exitReason: string | null
}

/**
 * Mean Reversion Strategy — Blueprint Section 2, Layer 2b
 *
 * Entry Long: price touches lower BB + RSI(14) < 30 + ADX(14) < 20
 * Entry Short: price touches upper BB + RSI(14) > 70 + ADX(14) < 20
 *
 * Exit: price reaches middle BB (target)
 *
 * Stop: 1.5x ATR beyond entry Bollinger Band
 */
export function evaluateMeanReversion(
  current: MeanRevSnapshot,
  hasOpenLong: boolean,
  hasOpenShort: boolean,
): MeanRevSignal {
  const RSI_OVERSOLD = 30
  const RSI_OVERBOUGHT = 70
  const ADX_RANGE_THRESHOLD = 20

  // --- Exit signals ---
  if (hasOpenLong && current.close >= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_middle_bb' }
  }

  if (hasOpenShort && current.close <= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_middle_bb' }
  }

  // --- Entry signals ---
  const isRanging = current.adx_14 < ADX_RANGE_THRESHOLD

  // Long: price at/below lower BB + RSI oversold + ranging market
  if (
    isRanging &&
    current.close <= current.bb_lower &&
    current.rsi_14 < RSI_OVERSOLD
  ) {
    const stopLoss = current.bb_lower - current.atr_14 * STOP_MULTIPLIER_MEAN_REV
    return { signal: 'long', stopLoss, exitSignal: false, exitReason: null }
  }

  // Short: price at/above upper BB + RSI overbought + ranging market
  if (
    isRanging &&
    current.close >= current.bb_upper &&
    current.rsi_14 > RSI_OVERBOUGHT
  ) {
    const stopLoss = current.bb_upper + current.atr_14 * STOP_MULTIPLIER_MEAN_REV
    return { signal: 'short', stopLoss, exitSignal: false, exitReason: null }
  }

  return { signal: 'none', stopLoss: null, exitSignal: false, exitReason: null }
}
