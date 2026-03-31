import { Candle } from './types'

export interface BollingerBand {
  upper: number
  middle: number
  lower: number
}

/**
 * Bollinger Bands (BB)
 *
 * Middle = SMA(period)
 * Upper = SMA + numStdDev × stddev
 * Lower = SMA - numStdDev × stddev
 *
 * Returns array of BollingerBand objects. Length = candles.length - period + 1
 */
export function calculateBollingerBands(
  candles: Candle[],
  period: number,
  numStdDev: number
): BollingerBand[] {
  if (candles.length < period || period < 1) {
    return []
  }

  const result: BollingerBand[] = []

  for (let i = period - 1; i < candles.length; i++) {
    // Calculate SMA
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close
    }
    const sma = sum / period

    // Calculate standard deviation
    let squaredDiffSum = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - sma
      squaredDiffSum += diff * diff
    }
    const stddev = Math.sqrt(squaredDiffSum / period)

    result.push({
      upper: sma + numStdDev * stddev,
      middle: sma,
      lower: sma - numStdDev * stddev,
    })
  }

  return result
}
