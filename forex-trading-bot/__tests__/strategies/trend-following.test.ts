import { describe, it, expect } from 'vitest'
import { evaluateTrendFollowing, IndicatorSnapshot } from '@/lib/strategies/trend-following'

function makeSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    ema_20: 2350,
    ema_50: 2340,
    adx_14: 30,
    atr_14: 15,
    close: 2355,
    ...overrides,
  }
}

describe('evaluateTrendFollowing', () => {
  // Entry signals
  it('generates long signal on EMA crossover above with ADX > 15', () => {
    const previous = makeSnapshot({ ema_20: 2335, ema_50: 2340 }) // EMA20 < EMA50
    const current = makeSnapshot({ ema_20: 2345, ema_50: 2340, adx_14: 18 }) // EMA20 > EMA50
    const result = evaluateTrendFollowing(current, previous, false, false)
    expect(result.signal).toBe('long')
    expect(result.stopLoss).toBeCloseTo(current.close - 15 * 2.0)
    expect(result.exitSignal).toBe(false)
  })

  it('generates short signal on EMA crossover below with ADX > 15', () => {
    const previous = makeSnapshot({ ema_20: 2345, ema_50: 2340 }) // EMA20 > EMA50
    const current = makeSnapshot({ ema_20: 2335, ema_50: 2340, adx_14: 18 }) // EMA20 < EMA50
    const result = evaluateTrendFollowing(current, previous, false, false)
    expect(result.signal).toBe('short')
    expect(result.stopLoss).toBeCloseTo(current.close + 15 * 2.0)
    expect(result.exitSignal).toBe(false)
  })

  it('returns no signal when ADX < 15 despite crossover', () => {
    const previous = makeSnapshot({ ema_20: 2335, ema_50: 2340 })
    const current = makeSnapshot({ ema_20: 2345, ema_50: 2340, adx_14: 12 })
    const result = evaluateTrendFollowing(current, previous, false, false)
    expect(result.signal).toBe('none')
    expect(result.stopLoss).toBeNull()
  })

  it('returns no signal when no crossover', () => {
    const previous = makeSnapshot({ ema_20: 2345, ema_50: 2340 }) // already above
    const current = makeSnapshot({ ema_20: 2350, ema_50: 2340, adx_14: 30 }) // still above
    const result = evaluateTrendFollowing(current, previous, false, false)
    expect(result.signal).toBe('none')
  })

  // Exit signals
  it('generates exit on EMA crossover reversal for open long', () => {
    const previous = makeSnapshot({ ema_20: 2345, ema_50: 2340 }) // long
    const current = makeSnapshot({ ema_20: 2335, ema_50: 2340 }) // crossed below
    const result = evaluateTrendFollowing(current, previous, true, false)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('ema_crossover_reversal')
    expect(result.signal).toBe('none')
  })

  it('generates exit when ADX drops below 10 for open long', () => {
    const previous = makeSnapshot({ ema_20: 2345, ema_50: 2340 })
    const current = makeSnapshot({ ema_20: 2346, ema_50: 2340, adx_14: 8 })
    const result = evaluateTrendFollowing(current, previous, true, false)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('adx_below_exit')
  })

  it('generates exit on EMA crossover reversal for open short', () => {
    const previous = makeSnapshot({ ema_20: 2335, ema_50: 2340 }) // short
    const current = makeSnapshot({ ema_20: 2345, ema_50: 2340 }) // crossed above
    const result = evaluateTrendFollowing(current, previous, false, true)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('ema_crossover_reversal')
  })

  it('generates exit when ADX drops below 10 for open short', () => {
    const previous = makeSnapshot({ ema_20: 2335, ema_50: 2340 })
    const current = makeSnapshot({ ema_20: 2334, ema_50: 2340, adx_14: 8 })
    const result = evaluateTrendFollowing(current, previous, false, true)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('adx_below_exit')
  })

  // No position, no signal
  it('returns no signal and no exit when nothing is happening', () => {
    const previous = makeSnapshot({ ema_20: 2345, ema_50: 2340 })
    const current = makeSnapshot({ ema_20: 2346, ema_50: 2340, adx_14: 12 })
    const result = evaluateTrendFollowing(current, previous, false, false)
    expect(result.signal).toBe('none')
    expect(result.exitSignal).toBe(false)
    expect(result.exitReason).toBeNull()
  })
})
