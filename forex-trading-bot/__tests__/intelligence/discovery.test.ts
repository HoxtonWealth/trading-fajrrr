import { describe, it, expect } from 'vitest'
import { validateDiscoveryResult } from '@/lib/intelligence/discovery'

describe('Instrument Discovery', () => {
  it('enforces min 3 active instruments — cannot remove below 3', () => {
    const result = validateDiscoveryResult(
      {
        add: [],
        remove: [{ instrument: 'EUR_USD', reason: 'test' }, { instrument: 'XAU_USD', reason: 'test' }],
        keep: [],
      },
      ['EUR_USD', 'XAU_USD', 'USD_JPY'] // only 3 active
    )
    // Can remove 0 (3 - 3 = 0 allowed)
    expect(result.remove.length).toBe(0)
  })

  it('allows removing when above minimum', () => {
    const result = validateDiscoveryResult(
      {
        add: [],
        remove: [{ instrument: 'EUR_USD', reason: 'test' }],
        keep: [],
      },
      ['EUR_USD', 'XAU_USD', 'USD_JPY', 'BCO_USD'] // 4 active, can remove 1
    )
    expect(result.remove.length).toBe(1)
    expect(result.remove[0].instrument).toBe('EUR_USD')
  })

  it('enforces max 12 active instruments — blocks adds at cap', () => {
    const current = Array.from({ length: 12 }, (_, i) => `INST_${i}`)
    const result = validateDiscoveryResult(
      {
        add: [{ instrument: 'NEW_1', reason: 'test', expected_regime: 'trending' }],
        remove: [],
        keep: [],
      },
      current
    )
    expect(result.add.length).toBe(0)
  })

  it('allows adds when below max', () => {
    const result = validateDiscoveryResult(
      {
        add: [{ instrument: 'GBP_USD', reason: 'strong trend', expected_regime: 'trending' }],
        remove: [],
        keep: [],
      },
      ['EUR_USD', 'XAU_USD', 'USD_JPY'] // 3 active, room for more
    )
    expect(result.add.length).toBe(1)
  })

  it('preserves keep list unchanged', () => {
    const result = validateDiscoveryResult(
      {
        add: [],
        remove: [],
        keep: [{ instrument: 'EUR_USD', reason: 'still good' }],
      },
      ['EUR_USD', 'XAU_USD']
    )
    expect(result.keep.length).toBe(1)
    expect(result.keep[0].instrument).toBe('EUR_USD')
  })
})
