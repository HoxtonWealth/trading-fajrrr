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
  it('long signal when price touches lower BB, RSI < 30, ADX < 20', () => {
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 25, adx_14: 17 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('long')
    expect(result.stopLoss).toBeCloseTo(1.2600 - 0.0050 * 1.5, 5)
    expect(result.exitSignal).toBe(false)
  })

  it('short signal when price touches upper BB, RSI > 70, ADX < 20', () => {
    const snap = makeSnapshot({ close: 1.2702, rsi_14: 75, adx_14: 17 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('short')
    expect(result.stopLoss).toBeCloseTo(1.2700 + 0.0050 * 1.5, 5)
    expect(result.exitSignal).toBe(false)
  })

  // No signal when conditions not met
  it('no signal when ADX > 20 (trending market)', () => {
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 25, adx_14: 27 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
  })

  it('no signal when RSI not extreme', () => {
    const snap = makeSnapshot({ close: 1.2598, rsi_14: 45, adx_14: 15 })
    const result = evaluateMeanReversion(snap, false, false)
    expect(result.signal).toBe('none')
  })

  it('no signal when price not at BB', () => {
    const snap = makeSnapshot({ close: 1.2650, rsi_14: 25, adx_14: 15 })
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
