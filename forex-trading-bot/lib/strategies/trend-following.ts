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
 *   - Long: EMA(20) crosses above EMA(50) AND ADX(14) > 15
 *   - Short: EMA(20) crosses below EMA(50) AND ADX(14) > 15
 *
 * Exit:
 *   - EMA crossover reversal
 *   - ADX drops below 10
 *   - Trailing stop hit (handled externally)
 *
 * Stop: 2x ATR(14) trailing stop
 *
 * ── Tuning History ──────────────────────────────────────────
 * Blueprint:  ADX entry 25, exit 20
 * 2026-04-01: ADX entry 20, exit 15 (loosened for learning)
 * 2026-04-03: ADX entry 15, exit 10 (data-driven: funnel analysis
 *             showed 11 crossovers in 14 days but only 3 passed ADX>20.
 *             Lowering to 15 captures 7 of 11 (+133%). Also fixes dead
 *             code in transition regime where TF ran but could never fire
 *             because regime=ADX 15-20 but TF required ADX>20.
 *             See: _bmad-output/analysis/trade-frequency-report.md)
 */
export function evaluateTrendFollowing(
  current: IndicatorSnapshot,
  previous: IndicatorSnapshot,
  hasOpenLong: boolean,
  hasOpenShort: boolean,
): TrendSignal {
  const ADX_ENTRY_THRESHOLD = 15
  const ADX_EXIT_THRESHOLD = 10

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
