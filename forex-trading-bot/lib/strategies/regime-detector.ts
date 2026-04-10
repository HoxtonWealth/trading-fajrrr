export type Regime = 'trending' | 'ranging' | 'transition'
export type StrategyName = 'trend' | 'mean_reversion'

export interface RegimeResult {
  regime: Regime
  strategies: StrategyName[]
  sizeMultiplier: number
}

/**
 * ADX-based regime detection — Blueprint Section 2, Layer 1
 *
 * ADX > 25  → Trending    → Trend following only
 * ADX 20–25 → Trending+MR → Both strategies (TF full, MR has its own ADX<25 gate)
 * ADX 15–20 → Transition  → Both strategies at 50% size
 * ADX < 15  → Ranging     → Mean reversion only
 *
 * ── Tuning History ──────────────────────────────────────────
 * Blueprint:  ADX>25 trending, ADX<20 ranging, 20-25 transition
 * 2026-04-03: Lowered boundaries to ADX>20/ADX<15 for more signals
 * 2026-04-10: ADX 20-25 zone now runs both strategies. Previously
 *             MR was blocked in "trending" (ADX>20) even though MR's
 *             own threshold is ADX<25. GER40_EUR at ADX 24 couldn't
 *             use MR despite qualifying. Fix: trending regime now
 *             includes MR when ADX<25 so both strategies can fire.
 */
export function detectRegime(adx: number): RegimeResult {
  if (adx > 25) {
    return { regime: 'trending', strategies: ['trend'], sizeMultiplier: 1.0 }
  }

  if (adx > 20) {
    // ADX 20-25: Strong enough for trend, mild enough for MR — run both
    return { regime: 'trending', strategies: ['trend', 'mean_reversion'], sizeMultiplier: 1.0 }
  }

  if (adx >= 15) {
    // Transition zone: 15 <= ADX <= 20 — both strategies at 50% size
    return { regime: 'transition', strategies: ['trend', 'mean_reversion'], sizeMultiplier: 0.5 }
  }

  // ADX < 15 — pure ranging
  return { regime: 'ranging', strategies: ['mean_reversion'], sizeMultiplier: 1.0 }
}
