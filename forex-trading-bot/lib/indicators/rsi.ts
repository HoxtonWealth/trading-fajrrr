import { Candle } from './types'

/**
 * Relative Strength Index (RSI)
 *
 * Steps:
 * 1. Calculate price changes (close - prevClose)
 * 2. Separate gains and losses
 * 3. First avg gain/loss = SMA of first `period` values
 * 4. Subsequent = Wilder's smoothing: (prev × (period-1) + current) / period
 * 5. RS = avgGain / avgLoss
 * 6. RSI = 100 - (100 / (1 + RS))
 *
 * Returns array of RSI values. Length = candles.length - period
 */
export function calculateRSI(candles: Candle[], period: number): number[] {
  if (candles.length < period + 1 || period < 1) {
    return []
  }

  // Calculate price changes
  const changes: number[] = []
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close)
  }

  // First average gain/loss (SMA of first `period` changes)
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i]
    } else {
      avgLoss += Math.abs(changes[i])
    }
  }
  avgGain /= period
  avgLoss /= period

  const result: number[] = []

  // First RSI
  if (avgLoss === 0) {
    result.push(100)
  } else {
    const rs = avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }

  // Subsequent RSI values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    if (avgLoss === 0) {
      result.push(100)
    } else {
      const rs = avgGain / avgLoss
      result.push(100 - 100 / (1 + rs))
    }
  }

  return result
}
