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
 * Entry Long: price near lower BB + RSI(14) < 45 + ADX(14) < 25
 * Entry Short: price near upper BB + RSI(14) > 55 + ADX(14) < 25
 *
 * Exit: When price crosses past the OPPOSITE BB (full mean reversion).
 *       Middle BB triggers a stop tighten to breakeven (handled in pipeline),
 *       NOT an immediate exit.
 *
 * Stop: 1.5x ATR beyond entry Bollinger Band
 *
 * ── Tuning History ──────────────────────────────────────────
 * Blueprint:  RSI 30/70, ADX < 20, exact BB touch, exit at middle BB
 * 2026-04-01: RSI 40/60, ADX < 25 (loosened for learning)
 * 2026-04-03: RSI 45/55, ADX < 25, BB proximity 0.5% tolerance
 * 2026-04-09: Exit changed from middle BB to opposite BB.
 *             Old exit at middle BB created 1:3 risk-reward AGAINST
 *             (avg win AED 17 vs avg loss AED 56). Winners now run
 *             to opposite band for ~1:1 risk-reward or better.
 *             Middle BB now triggers breakeven stop (tighten_to_breakeven).
 */
export function evaluateMeanReversion(
  current: MeanRevSnapshot,
  hasOpenLong: boolean,
  hasOpenShort: boolean,
): MeanRevSignal {
  const RSI_OVERSOLD = 45
  const RSI_OVERBOUGHT = 55
  const ADX_RANGE_THRESHOLD = 25
  const BB_TOLERANCE = 0.005 // 0.5% proximity — price within 0.5% of BB counts as "at band"

  // --- Exit signals ---

  // Long exit: price reached UPPER BB (full reversion target)
  if (hasOpenLong && current.close >= current.bb_upper) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_opposite_bb' }
  }

  // Short exit: price reached LOWER BB (full reversion target)
  if (hasOpenShort && current.close <= current.bb_lower) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_opposite_bb' }
  }

  // Middle BB: tighten stop to breakeven (not a full exit)
  // This returns an exit signal with reason 'tighten_to_breakeven' that the pipeline
  // uses to move the stop, not close the position.
  if (hasOpenLong && current.close >= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'tighten_to_breakeven' }
  }

  if (hasOpenShort && current.close <= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'tighten_to_breakeven' }
  }

  // --- Entry signals ---
  const isRanging = current.adx_14 < ADX_RANGE_THRESHOLD

  // Long: price at/near lower BB + RSI oversold + ranging market
  const lowerBBThreshold = current.bb_lower * (1 + BB_TOLERANCE)
  if (
    isRanging &&
    current.close <= lowerBBThreshold &&
    current.rsi_14 < RSI_OVERSOLD
  ) {
    const stopLoss = current.bb_lower - current.atr_14 * STOP_MULTIPLIER_MEAN_REV
    return { signal: 'long', stopLoss, exitSignal: false, exitReason: null }
  }

  // Short: price at/near upper BB + RSI overbought + ranging market
  const upperBBThreshold = current.bb_upper * (1 - BB_TOLERANCE)
  if (
    isRanging &&
    current.close >= upperBBThreshold &&
    current.rsi_14 > RSI_OVERBOUGHT
  ) {
    const stopLoss = current.bb_upper + current.atr_14 * STOP_MULTIPLIER_MEAN_REV
    return { signal: 'short', stopLoss, exitSignal: false, exitReason: null }
  }

  return { signal: 'none', stopLoss: null, exitSignal: false, exitReason: null }
}
