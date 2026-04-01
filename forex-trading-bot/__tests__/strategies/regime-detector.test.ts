import { describe, it, expect } from 'vitest'
import { detectRegime } from '@/lib/strategies/regime-detector'

describe('detectRegime', () => {
  it('trending when ADX > 20', () => {
    const result = detectRegime(25)
    expect(result.regime).toBe('trending')
    expect(result.strategies).toEqual(['trend'])
    expect(result.sizeMultiplier).toBe(1.0)
  })

  it('trending at ADX = 21', () => {
    const result = detectRegime(21)
    expect(result.regime).toBe('trending')
  })

  it('ranging when ADX < 15', () => {
    const result = detectRegime(10)
    expect(result.regime).toBe('ranging')
    expect(result.strategies).toEqual(['mean_reversion'])
    expect(result.sizeMultiplier).toBe(1.0)
  })

  it('ranging at ADX = 14', () => {
    const result = detectRegime(14)
    expect(result.regime).toBe('ranging')
  })

  it('transition when ADX = 17', () => {
    const result = detectRegime(17)
    expect(result.regime).toBe('transition')
    expect(result.strategies).toEqual(['trend', 'mean_reversion'])
    expect(result.sizeMultiplier).toBe(0.5)
  })

  it('transition at boundary ADX = 15', () => {
    const result = detectRegime(15)
    expect(result.regime).toBe('transition')
  })

  it('transition at boundary ADX = 20', () => {
    const result = detectRegime(20)
    expect(result.regime).toBe('transition')
  })
})
