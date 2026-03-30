import { describe, it, expect } from 'vitest'
import { runPreTradeChecks, PreTradeContext } from '@/lib/risk/pre-trade-checks'

function makeContext(overrides: Partial<PreTradeContext> = {}): PreTradeContext {
  return {
    riskPercent: 0.015,
    instrument: 'XAU_USD',
    units: 3,
    entryPrice: 2300,
    leverage: 5,
    dailyTradeCount: 2,
    openPositionCount: 1,
    openInstruments: ['EUR_USD'],
    correlations: {},
    currentSpread: 0.5,
    averageSpread: 0.4,
    dailyPnlPercent: -0.01,
    ...overrides,
  }
}

describe('runPreTradeChecks', () => {
  it('all 8 checks pass with valid context', () => {
    const result = runPreTradeChecks(makeContext())
    expect(result.pass).toBe(true)
    expect(result.checks.length).toBe(8)
    result.checks.forEach(check => {
      expect(check.pass).toBe(true)
    })
  })

  // Check 1: Max risk per trade
  it('fails when risk exceeds 2%', () => {
    const result = runPreTradeChecks(makeContext({ riskPercent: 0.03 }))
    expect(result.pass).toBe(false)
    expect(result.checks[0].pass).toBe(false)
    expect(result.checks[0].reason).toContain('3.0%')
    expect(result.checks[0].reason).toContain('exceeds')
  })

  it('passes when risk is exactly 2%', () => {
    const result = runPreTradeChecks(makeContext({ riskPercent: 0.02 }))
    expect(result.checks[0].pass).toBe(true)
  })

  // Check 2: Leverage cap
  it('fails when leverage exceeds cap for instrument', () => {
    // XAU_USD cap is 10
    const result = runPreTradeChecks(makeContext({ leverage: 12 }))
    expect(result.pass).toBe(false)
    expect(result.checks[1].pass).toBe(false)
    expect(result.checks[1].reason).toContain('12.0x')
  })

  it('passes when leverage at cap', () => {
    const result = runPreTradeChecks(makeContext({ leverage: 10 }))
    expect(result.checks[1].pass).toBe(true)
  })

  // Check 3: Daily trade count
  it('fails when daily trade count reaches max', () => {
    const result = runPreTradeChecks(makeContext({ dailyTradeCount: 10 }))
    expect(result.pass).toBe(false)
    expect(result.checks[2].pass).toBe(false)
    expect(result.checks[2].reason).toContain('10')
  })

  it('passes at 9 trades', () => {
    const result = runPreTradeChecks(makeContext({ dailyTradeCount: 9 }))
    expect(result.checks[2].pass).toBe(true)
  })

  // Check 4: Open positions
  it('fails when open positions at max', () => {
    const result = runPreTradeChecks(makeContext({ openPositionCount: 6 }))
    expect(result.pass).toBe(false)
    expect(result.checks[3].pass).toBe(false)
    expect(result.checks[3].reason).toContain('6')
  })

  // Check 5: Cluster limit
  it('fails when cluster has max positions', () => {
    // XAU_USD is cluster 3. If 2 other metals positions open:
    const result = runPreTradeChecks(makeContext({
      openInstruments: ['XAU_USD', 'XAU_USD'],
    }))
    expect(result.pass).toBe(false)
    expect(result.checks[4].pass).toBe(false)
  })

  // Check 6: Correlation
  it('fails when correlation > 0.7 with open position', () => {
    const result = runPreTradeChecks(makeContext({
      correlations: { EUR_USD: 0.85 },
    }))
    expect(result.pass).toBe(false)
    expect(result.checks[5].pass).toBe(false)
    expect(result.checks[5].reason).toContain('0.85')
  })

  it('passes when correlation is exactly 0.7', () => {
    const result = runPreTradeChecks(makeContext({
      correlations: { EUR_USD: 0.7 },
    }))
    expect(result.checks[5].pass).toBe(true)
  })

  // Check 7: Spread filter
  it('fails when spread > 2x average', () => {
    const result = runPreTradeChecks(makeContext({
      currentSpread: 1.0,
      averageSpread: 0.4,
    }))
    expect(result.pass).toBe(false)
    expect(result.checks[6].pass).toBe(false)
  })

  it('passes when spread is exactly 2x average', () => {
    const result = runPreTradeChecks(makeContext({
      currentSpread: 0.8,
      averageSpread: 0.4,
    }))
    expect(result.checks[6].pass).toBe(true)
  })

  // Check 8: Daily loss buffer
  it('fails when daily P&L at -4%', () => {
    const result = runPreTradeChecks(makeContext({ dailyPnlPercent: -0.04 }))
    expect(result.pass).toBe(false)
    expect(result.checks[7].pass).toBe(false)
    expect(result.checks[7].reason).toContain('-4.0%')
  })

  it('passes when daily P&L is -3.9%', () => {
    const result = runPreTradeChecks(makeContext({ dailyPnlPercent: -0.039 }))
    expect(result.checks[7].pass).toBe(true)
  })

  // Multiple failures
  it('reports all failing checks', () => {
    const result = runPreTradeChecks(makeContext({
      riskPercent: 0.05,
      dailyTradeCount: 10,
      openPositionCount: 6,
    }))
    expect(result.pass).toBe(false)
    const failures = result.checks.filter(c => !c.pass)
    expect(failures.length).toBe(3)
  })
})
