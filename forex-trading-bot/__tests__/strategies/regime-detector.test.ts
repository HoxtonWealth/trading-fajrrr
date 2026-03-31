import { describe, it, expect } from 'vitest'
import { detectRegime } from '@/lib/strategies/regime-detector'

describe('detectRegime', () => {
  it('trending when ADX > 25', () => {
    const result = detectRegime(30)
    expect(result.regime).toBe('trending')
    expect(result.strategies).toEqual(['trend'])
    expect(result.sizeMultiplier).toBe(1.0)
  })

  it('trending at ADX = 26', () => {
    const result = detectRegime(26)
    expect(result.regime).toBe('trending')
  })

  it('ranging when ADX < 20', () => {
    const result = detectRegime(15)
    expect(result.regime).toBe('ranging')
    expect(result.strategies).toEqual(['mean_reversion'])
    expect(result.sizeMultiplier).toBe(1.0)
  })

  it('ranging at ADX = 19', () => {
    const result = detectRegime(19)
    expect(result.regime).toBe('ranging')
  })

  it('transition when ADX = 22', () => {
    const result = detectRegime(22)
    expect(result.regime).toBe('transition')
    expect(result.strategies).toEqual(['trend', 'mean_reversion'])
    expect(result.sizeMultiplier).toBe(0.5)
  })

  it('transition at boundary ADX = 20', () => {
    const result = detectRegime(20)
    expect(result.regime).toBe('transition')
  })

  it('transition at boundary ADX = 25', () => {
    const result = detectRegime(25)
    expect(result.regime).toBe('transition')
  })
})
