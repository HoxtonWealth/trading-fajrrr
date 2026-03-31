import { describe, it, expect } from 'vitest'
import { calculateBollingerBands } from '@/lib/indicators/bollinger'
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

describe('calculateBollingerBands', () => {
  it('returns empty array for insufficient data', () => {
    expect(calculateBollingerBands([], 20, 2)).toEqual([])
    expect(calculateBollingerBands(makeCandles([1, 2]), 5, 2)).toEqual([])
  })

  it('middle band equals SMA', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calculateBollingerBands(candles, 5, 2)
    // SMA of [10,20,30,40,50] = 30
    expect(result[0].middle).toBeCloseTo(30, 5)
  })

  it('bands are symmetric around middle', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calculateBollingerBands(candles, 5, 2)
    const band = result[0]
    const upperDist = band.upper - band.middle
    const lowerDist = band.middle - band.lower
    expect(upperDist).toBeCloseTo(lowerDist, 10)
  })

  it('upper = SMA + 2*stddev, lower = SMA - 2*stddev', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calculateBollingerBands(candles, 5, 2)
    // SMA = 30
    // stddev = sqrt(((10-30)^2 + (20-30)^2 + (30-30)^2 + (40-30)^2 + (50-30)^2) / 5)
    //        = sqrt((400 + 100 + 0 + 100 + 400) / 5)
    //        = sqrt(200) = 14.142...
    const expectedStdDev = Math.sqrt(200)
    expect(result[0].upper).toBeCloseTo(30 + 2 * expectedStdDev, 5)
    expect(result[0].lower).toBeCloseTo(30 - 2 * expectedStdDev, 5)
  })

  it('identical prices produce bands that collapse to SMA', () => {
    const candles = makeCandles([50, 50, 50, 50, 50])
    const result = calculateBollingerBands(candles, 5, 2)
    expect(result[0].upper).toBeCloseTo(50, 10)
    expect(result[0].middle).toBeCloseTo(50, 10)
    expect(result[0].lower).toBeCloseTo(50, 10)
  })

  it('length = candles.length - period + 1', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = calculateBollingerBands(candles, 5, 2)
    expect(result.length).toBe(6) // 10 - 5 + 1
  })

  it('wider numStdDev produces wider bands', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const narrow = calculateBollingerBands(candles, 5, 1)
    const wide = calculateBollingerBands(candles, 5, 3)
    expect(wide[0].upper).toBeGreaterThan(narrow[0].upper)
    expect(wide[0].lower).toBeLessThan(narrow[0].lower)
  })
})
