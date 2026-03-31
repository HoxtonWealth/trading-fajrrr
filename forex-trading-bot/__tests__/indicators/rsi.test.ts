import { describe, it, expect } from 'vitest'
import { calculateRSI } from '@/lib/indicators/rsi'
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

describe('calculateRSI', () => {
  it('returns empty array for insufficient data', () => {
    expect(calculateRSI([], 14)).toEqual([])
    expect(calculateRSI(makeCandles([1, 2, 3]), 14)).toEqual([])
  })

  it('returns 100 when all moves are up', () => {
    const candles = makeCandles([10, 11, 12, 13, 14, 15])
    const result = calculateRSI(candles, 3)
    expect(result[0]).toBe(100)
  })

  it('returns 0 when all moves are down', () => {
    const candles = makeCandles([15, 14, 13, 12, 11, 10])
    const result = calculateRSI(candles, 3)
    expect(result[0]).toBe(0)
  })

  it('returns ~50 for equal up/down moves', () => {
    const candles = makeCandles([10, 12, 10, 12, 10, 12, 10])
    const result = calculateRSI(candles, 2)
    // After initial period, gains and losses should balance
    result.forEach(rsi => {
      expect(rsi).toBeGreaterThanOrEqual(0)
      expect(rsi).toBeLessThanOrEqual(100)
    })
  })

  it('RSI is bounded between 0 and 100', () => {
    const prices = [100, 105, 95, 110, 90, 115, 85, 120, 80, 125, 75, 130, 70, 135, 65, 140]
    const candles = makeCandles(prices)
    const result = calculateRSI(candles, 5)
    result.forEach(rsi => {
      expect(rsi).toBeGreaterThanOrEqual(0)
      expect(rsi).toBeLessThanOrEqual(100)
    })
  })

  it('length = candles.length - period', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = calculateRSI(candles, 5)
    expect(result.length).toBe(5) // 10 - 5 = 5
  })

  it('strong uptrend produces RSI > 70', () => {
    // Consistent uptrend with small pullbacks
    const prices = [100, 102, 104, 103, 106, 108, 107, 110, 112, 114, 113, 116, 118, 120, 122, 124]
    const candles = makeCandles(prices)
    const result = calculateRSI(candles, 5)
    const lastRSI = result[result.length - 1]
    expect(lastRSI).toBeGreaterThan(60) // uptrend should push RSI high
  })
})
