import { CORRELATION_WINDOW } from './constants'

/**
 * Pearson correlation coefficient over a rolling window.
 *
 * r = Σ((x-x̄)(y-ȳ)) / (sqrt(Σ(x-x̄)²) * sqrt(Σ(y-ȳ)²))
 *
 * Returns correlation between -1 and 1, or 0 if insufficient data.
 */
export function pearsonCorrelation(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length, CORRELATION_WINDOW)
  if (n < 3) return 0

  // Use the last `n` values
  const a = seriesA.slice(-n)
  const b = seriesB.slice(-n)

  const meanA = a.reduce((s, v) => s + v, 0) / n
  const meanB = b.reduce((s, v) => s + v, 0) / n

  let sumAB = 0
  let sumA2 = 0
  let sumB2 = 0

  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    sumAB += da * db
    sumA2 += da * da
    sumB2 += db * db
  }

  const denom = Math.sqrt(sumA2) * Math.sqrt(sumB2)
  if (denom === 0) return 0

  return sumAB / denom
}
