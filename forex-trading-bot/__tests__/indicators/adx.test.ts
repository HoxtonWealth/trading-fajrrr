import { describe, it, expect } from 'vitest'
import { calculateADX } from '@/lib/indicators/adx'
import { Candle } from '@/lib/indicators/types'

function makeCandle(high: number, low: number, close: number): Candle {
  return {
    time: new Date().toISOString(),
    open: (high + low) / 2,
    high,
    low,
    close,
    volume: 100,
  }
}

describe('calculateADX', () => {
  it('returns empty array for empty candles', () => {
    expect(calculateADX([], 14)).toEqual([])
  })

  it('returns empty array when candles < 2*period+1', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      makeCandle(100 + i, 95 + i, 98 + i)
    )
    expect(calculateADX(candles, 14)).toEqual([])
  })

  it('returns values for sufficient data', () => {
    // Create 30 candles with a clear uptrend (ADX should be > 0)
    const candles: Candle[] = []
    for (let i = 0; i < 30; i++) {
      const base = 100 + i * 2 // clear uptrend
      candles.push(makeCandle(base + 3, base - 1, base + 1))
    }

    const result = calculateADX(candles, 5)
    expect(result.length).toBeGreaterThan(0)
    // In an uptrend, ADX should be positive
    result.forEach(adx => {
      expect(adx).toBeGreaterThanOrEqual(0)
      expect(adx).toBeLessThanOrEqual(100)
    })
  })

  it('ADX is bounded between 0 and 100', () => {
    // Random-ish volatile data
    const candles: Candle[] = []
    const prices = [100, 105, 95, 110, 90, 115, 85, 120, 80, 125, 75, 130, 70, 135, 65]
    for (let i = 0; i < 30; i++) {
      const p = prices[i % prices.length] + i
      candles.push(makeCandle(p + 5, p - 5, p))
    }

    const result = calculateADX(candles, 5)
    result.forEach(adx => {
      expect(adx).toBeGreaterThanOrEqual(0)
      expect(adx).toBeLessThanOrEqual(100)
    })
  })

  it('strong trend produces higher ADX than ranging market', () => {
    // Strong uptrend
    const trendCandles: Candle[] = []
    for (let i = 0; i < 30; i++) {
      const base = 100 + i * 5
      trendCandles.push(makeCandle(base + 2, base - 1, base + 1))
    }

    // Ranging market
    const rangeCandles: Candle[] = []
    for (let i = 0; i < 30; i++) {
      const base = 100 + (i % 2 === 0 ? 3 : -3)
      rangeCandles.push(makeCandle(base + 2, base - 2, base))
    }

    const trendADX = calculateADX(trendCandles, 5)
    const rangeADX = calculateADX(rangeCandles, 5)

    // Average ADX of trend should be higher than range
    const avgTrend = trendADX.reduce((s, v) => s + v, 0) / trendADX.length
    const avgRange = rangeADX.reduce((s, v) => s + v, 0) / rangeADX.length
    expect(avgTrend).toBeGreaterThan(avgRange)
  })
})
