import { Candle } from './types'

/**
 * Average Directional Index (ADX)
 *
 * Steps:
 * 1. Calculate +DM (positive directional movement) and -DM
 * 2. Smooth +DM and -DM using Wilder's smoothing
 * 3. Calculate +DI = smoothed +DM / ATR × 100
 * 4. Calculate -DI = smoothed -DM / ATR × 100
 * 5. DX = |+DI - -DI| / (+DI + -DI) × 100
 * 6. ADX = smoothed DX using Wilder's smoothing
 *
 * Returns array of ADX values. Length = candles.length - 2 * period
 */
export function calculateADX(candles: Candle[], period: number): number[] {
  if (candles.length < 2 * period + 1 || period < 1) {
    return []
  }

  // Step 1: Calculate True Range, +DM, -DM for each candle pair
  const trValues: number[] = []
  const plusDM: number[] = []
  const minusDM: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevHigh = candles[i - 1].high
    const prevLow = candles[i - 1].low
    const prevClose = candles[i - 1].close

    // True Range
    trValues.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ))

    // Directional Movement
    const upMove = high - prevHigh
    const downMove = prevLow - low

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove)
    } else {
      plusDM.push(0)
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove)
    } else {
      minusDM.push(0)
    }
  }

  // Step 2: Wilder's smoothing for TR, +DM, -DM (first value = sum of first `period`)
  let smoothedTR = 0
  let smoothedPlusDM = 0
  let smoothedMinusDM = 0

  for (let i = 0; i < period; i++) {
    smoothedTR += trValues[i]
    smoothedPlusDM += plusDM[i]
    smoothedMinusDM += minusDM[i]
  }

  // Step 3-5: Calculate DI and DX values
  const dxValues: number[] = []

  // First DX
  const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0
  const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0
  const diSum = plusDI + minusDI
  dxValues.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0)

  // Subsequent DX values using Wilder's smoothing
  for (let i = period; i < trValues.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trValues[i]
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i]
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i]

    const pDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0
    const mDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0
    const sum = pDI + mDI
    dxValues.push(sum > 0 ? (Math.abs(pDI - mDI) / sum) * 100 : 0)
  }

  // Step 6: ADX = Wilder's smoothed DX
  if (dxValues.length < period) {
    return []
  }

  let adxSum = 0
  for (let i = 0; i < period; i++) {
    adxSum += dxValues[i]
  }
  let adx = adxSum / period

  const result: number[] = [adx]

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period
    result.push(adx)
  }

  return result
}
