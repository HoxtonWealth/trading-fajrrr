import { AgentScorecard } from './types'
import { detectRegime } from '@/lib/strategies/regime-detector'

/**
 * Regime Analyst — pure code, no LLM needed.
 * Reads ADX and classifies the market regime.
 */
export function runRegimeAnalyst(
  instrument: string,
  adx: number,
  emaAbove: boolean,
): AgentScorecard {
  const regime = detectRegime(adx)

  let signal: 'long' | 'short' | 'hold' = 'hold'
  let confidence = 0

  if (regime.regime === 'trending') {
    signal = emaAbove ? 'long' : 'short'
    confidence = Math.min(1, (adx - 25) / 25 + 0.5) // 0.5 at ADX=25, 1.0 at ADX=50
  } else if (regime.regime === 'ranging') {
    signal = 'hold' // Mean reversion handled by strategy, not regime agent
    confidence = Math.min(1, (20 - adx) / 20 + 0.3)
  } else {
    // Transition
    signal = 'hold'
    confidence = 0.3
  }

  return {
    agent: 'regime',
    instrument,
    signal,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasoning: `Regime: ${regime.regime} (ADX=${adx.toFixed(1)}). Strategies: ${regime.strategies.join(', ')}. Size multiplier: ${regime.sizeMultiplier}`,
  }
}
