import { describe, it, expect } from 'vitest'
import { calculatePositionSize } from '@/lib/risk/position-sizer'

describe('calculatePositionSize', () => {
  it('returns 0 units when equity is 0', () => {
    const result = calculatePositionSize({
      equity: 0, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.units).toBe(0)
  })

  it('returns 0 units when equity is negative', () => {
    const result = calculatePositionSize({
      equity: -100, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.units).toBe(0)
  })

  it('returns 0 units when ATR is 0', () => {
    const result = calculatePositionSize({
      equity: 5000, atr: 0, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.units).toBe(0)
  })

  it('calculates correct stop distance', () => {
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.stopDistance).toBeCloseTo(30, 5) // 15 * 2.0
  })

  it('risk percent defaults to MAX_RISK_PER_TRADE (2%)', () => {
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.riskPercent).toBe(0.02)
  })

  it('units are always rounded down (floor)', () => {
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    expect(result.units).toBe(Math.floor(result.units))
    expect(Number.isInteger(result.units)).toBe(true)
  })

  it('Half-Kelly caps at MAX_RISK_PER_TRADE', () => {
    // Kelly with high win rate would suggest > 2%
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
      winRate: 0.8, avgWinLoss: 3.0,
    })
    expect(result.riskPercent).toBeLessThanOrEqual(0.02)
  })

  it('Half-Kelly returns 0 units when Kelly is negative', () => {
    // Very low win rate → negative Kelly
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
      winRate: 0.1, avgWinLoss: 0.5,
    })
    expect(result.units).toBe(0)
    expect(result.riskPercent).toBe(0)
  })

  it('Half-Kelly uses lower risk when Kelly suggests less than 2%', () => {
    // Moderate win rate with moderate reward
    // Kelly = ((0.4*1.5 - 0.6) / 1.5) * 0.5 = ((0.6 - 0.6) / 1.5) * 0.5 = 0
    // Edge case: exactly break-even Kelly
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
      winRate: 0.4, avgWinLoss: 1.5,
    })
    // Kelly = ((0.4*1.5 - 0.6)/1.5)*0.5 = (0/1.5)*0.5 = 0
    // Zero Kelly → no trade
    expect(result.units).toBe(0)
  })

  it('produces reasonable units for typical XAU_USD parameters', () => {
    // Equity $5000, ATR ~15, stop 2x = 30, close ~2300
    const result = calculatePositionSize({
      equity: 5000, atr: 15, stopMultiplier: 2.0, close: 2300,
    })
    // Base: (5000 * 0.02) / 30 = 3.33 units before vol adjustment
    // Vol adjustment: (15/2300)*sqrt(252) ≈ 0.1035, volMult = 0.20/0.1035 ≈ 1.932
    // 3.33 * 1.932 ≈ 6.44 → floor = 6
    expect(result.units).toBeGreaterThan(0)
    expect(result.units).toBeLessThan(20) // sanity check
  })

  it('caps XAU_USD units at leverage cap of 15', () => {
    // Large equity + low close → units would exceed leverage cap
    // maxUnits = (equity * leverageCap) / close = (50000 * 15) / 2300 ≈ 326
    const result = calculatePositionSize({
      equity: 50000, atr: 5, stopMultiplier: 1.5, close: 2300,
      instrument: 'XAU_USD',
    })
    const maxUnits = Math.floor((50000 * 15) / 2300)
    expect(result.units).toBeLessThanOrEqual(maxUnits)
  })

  it('applies correct leverage cap for new instruments', () => {
    // GER40_EUR has leverage cap 15
    const result = calculatePositionSize({
      equity: 50000, atr: 50, stopMultiplier: 2.0, close: 18000,
      instrument: 'GER40_EUR',
    })
    const maxUnits = Math.floor((50000 * 15) / 18000)
    expect(result.units).toBeLessThanOrEqual(maxUnits)
  })
})
