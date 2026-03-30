import { Candle } from './types'

/**
 * Average True Range (ATR)
 *
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = smoothed average of TR over `period` candles (Wilder's smoothing)
 *
 * First ATR = simple average of the first `period` TRs.
 * Returns array of ATR values. Length = candles.length - period
 */
export function calculateATR(candles: Candle[], period: number): number[] {
  if (candles.length < period + 1 || period < 1) {
    return []
  }

  // Calculate True Range for each candle (starting from index 1)
  const trValues: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trValues.push(tr)
  }

  if (trValues.length < period) {
    return []
  }

  // First ATR is the simple average of the first `period` TRs
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += trValues[i]
  }
  let atr = sum / period

  const result: number[] = [atr]

  // Wilder's smoothing: ATR = (prevATR × (period - 1) + TR) / period
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period
    result.push(atr)
  }

  return result
}
