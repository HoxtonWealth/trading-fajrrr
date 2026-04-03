import { describe, it, expect } from 'vitest'
import { evaluateMeanReversion, MeanRevSnapshot } from '@/lib/strategies/mean-reversion'

function makeSnapshot(overrides: Partial<MeanRevSnapshot> = {}): MeanRevSnapshot {
  return {
    rsi_14: 50,
    adx_14: 15,
    atr_14: 0.0050,
    bb_upper: 1.2700,
    bb_middle: 1.2650,
    bb_lower: 1.2600,
    close: 1.2650,
    ...overrides,
  }
}

describe('evaluateMeanReversion', () => {
  // Entry signals
  it('long signal when price at lower BB, RSI < 45, ADX < 25', () => {
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 40, adx_14: 17 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('long')
    expect(result.stopLoss).toBeCloseTo(1.2600 - 0.0050 * 1.5, 5)
    expect(result.exitSignal).toBe(false)
  })

  it('long signal when price within 0.5% of lower BB (proximity tolerance)', () => {
    // BB lower = 1.2600, 0.5% above = 1.2663. Close at 1.2630 is within tolerance.
    const snap = makeSnapshot({ close: 1.2630, rsi_14: 40, adx_14: 17 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('long')
  })

  it('short signal when price at upper BB, RSI > 55, ADX < 25', () => {
    const snap = makeSnapshot({ close: 1.2702, rsi_14: 60, adx_14: 17 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('short')
    expect(result.stopLoss).toBeCloseTo(1.2700 + 0.0050 * 1.5, 5)
    expect(result.exitSignal).toBe(false)
  })

  // No signal when conditions not met
  it('no signal when ADX > 25 (trending market)', () => {
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 40, adx_14: 27 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
  })

  it('no signal when RSI not extreme enough', () => {
    // RSI 48 is between 45 and 55 — neutral zone
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 48, adx_14: 15 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
  })

  it('no signal when price far from BB', () => {
    // close=1.2670 is above lowerBBThreshold (1.2600*1.005=1.2663) and below upperBBThreshold
    const snap = makeSnapshot({ close: 1.2670, rsi_14: 40, adx_14: 15 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
  })

  // Exit signals
  it('exit long when price reaches middle BB', () => {
    const snap = makeSnapshot({ close: 1.2650, bb_middle: 1.2650 })
    const result = evaluateMeanReversion(snap, true, false)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('reached_middle_bb')
    expect(result.signal).toBe('none')
  })

  it('exit short when price reaches middle BB', () => {
    const snap = makeSnapshot({ close: 1.2640, bb_middle: 1.2650 })
    const result = evaluateMeanReversion(snap, false, true)
    expect(result.exitSignal).toBe(true)
    expect(result.exitReason).toBe('reached_middle_bb')
  })

  // No exit when position open but target not reached
  it('no exit for long when price below middle BB', () => {
    const snap = makeSnapshot({ close: 1.2620, bb_middle: 1.2650 })
    const result = evaluateMeanReversion(snap, true, false)
    expect(result.exitSignal).toBe(false)
  })

  // No signal, no position
  it('no signal and no exit in neutral conditions', () => {
    const snap = makeSnapshot()
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
    expect(result.exitSignal).toBe(false)
    expect(result.exitReason).toBeNull()
  })
})
