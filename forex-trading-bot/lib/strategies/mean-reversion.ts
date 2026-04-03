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
 * Exit: price reaches middle BB (target)
 *
 * Stop: 1.5x ATR beyond entry Bollinger Band
 *
 * ── Tuning History ──────────────────────────────────────────
 * Blueprint:  RSI 30/70, ADX < 20, exact BB touch
 * 2026-04-01: RSI 40/60, ADX < 25 (loosened for learning)
 * 2026-04-03: RSI 45/55, ADX < 25, BB proximity 0.5% tolerance
 *             (data-driven: funnel analysis showed relaxing RSI
 *             from 40/60 to 45/55 adds +15% MR signals. BB proximity
 *             tolerance captures ~10 near-miss signals where price was
 *             within 0.5% of the band but not touching.
 *             See: _bmad-output/analysis/trade-frequency-report.md)
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
  if (hasOpenLong && current.close >= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_middle_bb' }
  }

  if (hasOpenShort && current.close <= current.bb_middle) {
    return { signal: 'none', stopLoss: null, exitSignal: true, exitReason: 'reached_middle_bb' }
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
