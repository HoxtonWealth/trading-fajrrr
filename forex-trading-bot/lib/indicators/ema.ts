import { Candle } from './types'

/**
 * Exponential Moving Average (EMA)
 *
 * EMA = close × multiplier + prevEMA × (1 - multiplier)
 * multiplier = 2 / (period + 1)
 *
 * First EMA value is the SMA of the first `period` candles.
 * Returns array of EMA values aligned to the end of the candles array.
 * Length = candles.length - period + 1
 */
export function calculateEMA(candles: Candle[], period: number): number[] {
  if (candles.length < period || period < 1) {
    return []
  }

  const multiplier = 2 / (period + 1)
  const result: number[] = []

  // SMA for the first value
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += candles[i].close
  }
  let ema = sum / period
  result.push(ema)

  // EMA for the rest
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * multiplier + ema * (1 - multiplier)
    result.push(ema)
  }

  return result
}
