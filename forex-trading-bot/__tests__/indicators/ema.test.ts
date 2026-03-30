import { describe, it, expect } from 'vitest'
import { calculateEMA } from '@/lib/indicators/ema'
import { Candle } from '@/lib/indicators/types'

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: new Date(Date.now() + i * 3600000).toISOString(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }))
}

describe('calculateEMA', () => {
  it('returns empty array for empty candles', () => {
    expect(calculateEMA([], 20)).toEqual([])
  })

  it('returns empty array when candles < period', () => {
    const candles = makeCandles([1, 2, 3])
    expect(calculateEMA(candles, 5)).toEqual([])
  })

  it('first EMA value equals SMA of first period candles', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calculateEMA(candles, 5)
    // SMA of [10,20,30,40,50] = 30
    expect(result[0]).toBeCloseTo(30, 5)
  })

  it('computes correct EMA values for known data', () => {
    // period=3, multiplier = 2/(3+1) = 0.5
    const candles = makeCandles([2, 4, 6, 8, 10])
    const result = calculateEMA(candles, 3)

    // First EMA (SMA): (2+4+6)/3 = 4
    expect(result[0]).toBeCloseTo(4, 5)
    // Second: 8*0.5 + 4*0.5 = 6
    expect(result[1]).toBeCloseTo(6, 5)
    // Third: 10*0.5 + 6*0.5 = 8
    expect(result[2]).toBeCloseTo(8, 5)
  })

  it('length = candles.length - period + 1', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = calculateEMA(candles, 3)
    expect(result.length).toBe(8)
  })

  it('handles period = 1 (EMA equals close prices)', () => {
    const candles = makeCandles([5, 10, 15])
    const result = calculateEMA(candles, 1)
    // multiplier = 2/2 = 1, so EMA = close always
    expect(result).toEqual([5, 10, 15])
  })
})
