import {
  MAX_RISK_PER_TRADE,
  TARGET_ANNUAL_VOL,
} from './constants'

export interface PositionSizeInput {
  equity: number
  atr: number
  stopMultiplier: number
  close: number
  winRate?: number   // for Kelly criterion (0 to 1)
  avgWinLoss?: number // avg win / avg loss ratio
}

export interface PositionSizeResult {
  units: number
  riskPercent: number
  stopDistance: number
}

/**
 * Calculate position size using:
 * 1. Half-Kelly (if historical data available), capped at MAX_RISK_PER_TRADE
 * 2. ATR-based: units = (equity × risk%) / (ATR × stop_multiplier)
 * 3. Volatility targeting: scale by target_vol / estimated_vol
 */
export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { equity, atr, stopMultiplier, close, winRate, avgWinLoss } = input

  if (equity <= 0 || atr <= 0 || close <= 0) {
    return { units: 0, riskPercent: 0, stopDistance: 0 }
  }

  // Step 1: Determine risk percent
  let riskPercent = MAX_RISK_PER_TRADE

  if (winRate !== undefined && avgWinLoss !== undefined && winRate > 0 && avgWinLoss > 0) {
    // Half-Kelly: f* = (p*b - q) / b * 0.5
    const p = winRate
    const q = 1 - p
    const b = avgWinLoss
    const kelly = ((p * b - q) / b) * 0.5

    if (kelly > 0) {
      riskPercent = Math.min(kelly, MAX_RISK_PER_TRADE)
    } else {
      // Negative Kelly = don't trade, but return 0 units
      return { units: 0, riskPercent: 0, stopDistance: 0 }
    }
  }

  // Step 2: ATR-based position size
  const stopDistance = atr * stopMultiplier
  let units = (equity * riskPercent) / stopDistance

  // Step 3: Volatility targeting
  // estimated_vol = (ATR / close) * sqrt(252)
  const estimatedVol = (atr / close) * Math.sqrt(252)
  if (estimatedVol > 0) {
    const volMultiplier = TARGET_ANNUAL_VOL / estimatedVol
    units *= volMultiplier
  }

  // Round down — never round up risk
  units = Math.floor(units)

  return {
    units: Math.max(0, units),
    riskPercent,
    stopDistance,
  }
}
