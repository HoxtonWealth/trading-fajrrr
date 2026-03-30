import { describe, it, expect } from 'vitest'
import { calculateATR } from '@/lib/indicators/atr'
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

describe('calculateATR', () => {
  it('returns empty array for empty candles', () => {
    expect(calculateATR([], 14)).toEqual([])
  })

  it('returns empty array when candles <= period', () => {
    const candles = [
      makeCandle(10, 8, 9),
      makeCandle(11, 9, 10),
    ]
    expect(calculateATR(candles, 3)).toEqual([])
  })

  it('computes correct ATR for simple data', () => {
    // 4 candles, period=2
    // Need at least period+1 = 3 candles
    const candles = [
      makeCandle(10, 8, 9),   // candle 0
      makeCandle(12, 9, 11),  // TR = max(12-9, |12-9|, |9-9|) = max(3, 3, 0) = 3
      makeCandle(13, 10, 12), // TR = max(13-10, |13-11|, |10-11|) = max(3, 2, 1) = 3
      makeCandle(11, 8, 9),   // TR = max(11-8, |11-12|, |8-12|) = max(3, 1, 4) = 4
    ]
    const result = calculateATR(candles, 2)

    // First ATR = avg of first 2 TRs = (3 + 3) / 2 = 3
    expect(result[0]).toBeCloseTo(3, 5)
    // Second ATR = (3 * 1 + 4) / 2 = 3.5
    expect(result[1]).toBeCloseTo(3.5, 5)
    expect(result.length).toBe(2)
  })

  it('uses Wilder smoothing correctly', () => {
    // 5 candles, period=3
    const candles = [
      makeCandle(100, 95, 98),
      makeCandle(102, 96, 100),  // TR = max(6, |102-98|, |96-98|) = max(6, 4, 2) = 6
      makeCandle(101, 97, 99),   // TR = max(4, |101-100|, |97-100|) = max(4, 1, 3) = 4
      makeCandle(105, 98, 103),  // TR = max(7, |105-99|, |98-99|) = max(7, 6, 1) = 7
      makeCandle(104, 100, 102), // TR = max(4, |104-103|, |100-103|) = max(4, 1, 3) = 4
    ]
    const result = calculateATR(candles, 3)

    // First ATR = (6 + 4 + 7) / 3 = 5.6667
    expect(result[0]).toBeCloseTo(17 / 3, 4)
    // Second ATR = (5.6667 * 2 + 4) / 3 = 5.1111
    expect(result[1]).toBeCloseTo((17 / 3 * 2 + 4) / 3, 4)
    expect(result.length).toBe(2)
  })
})
