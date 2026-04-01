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
 * ADX > 25  → Trending    → Trend following at full size
 * ADX < 20  → Ranging     → Mean reversion at full size
 * ADX 20–25 → Transition  → Both strategies at 50% size
 */
export function detectRegime(adx: number): RegimeResult {
  if (adx > 20) {
    return { regime: 'trending', strategies: ['trend'], sizeMultiplier: 1.0 }
  }

  if (adx < 15) {
    return { regime: 'ranging', strategies: ['mean_reversion'], sizeMultiplier: 1.0 }
  }

  // Transition zone: 15 <= ADX <= 20 — both strategies at 50% size
  return { regime: 'transition', strategies: ['trend', 'mean_reversion'], sizeMultiplier: 0.5 }
}
