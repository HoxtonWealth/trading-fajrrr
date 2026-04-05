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
    drawdownPercent: 0.10,
    ...overrides,
  }
}

describe('runPreTradeChecks', () => {
  it('all 9 checks pass with valid context', () => {
    const result = runPreTradeChecks(makeContext())
    expect(result.pass).toBe(true)
    expect(result.checks.length).toBe(9)
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
    // XAU_USD cap is 15
    const result = runPreTradeChecks(makeContext({ leverage: 16 }))
    expect(result.pass).toBe(false)
    expect(result.checks[1].pass).toBe(false)
    expect(result.checks[1].reason).toContain('16.0x')
  })

  it('passes when leverage at cap', () => {
    const result = runPreTradeChecks(makeContext({ leverage: 15 }))
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
    const result = runPreTradeChecks(makeContext({ openPositionCount: 8 }))
    expect(result.pass).toBe(false)
    expect(result.checks[3].pass).toBe(false)
    expect(result.checks[3].reason).toContain('8')
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

  // Check 8: Drawdown circuit breaker
  it('fails when drawdown exceeds 30%', () => {
    const result = runPreTradeChecks(makeContext({ drawdownPercent: 0.35 }))
    expect(result.pass).toBe(false)
    expect(result.checks[7].pass).toBe(false)
    expect(result.checks[7].reason).toContain('35.0%')
    expect(result.checks[7].reason).toContain('exceeds')
  })

  it('passes when drawdown is below 30%', () => {
    const result = runPreTradeChecks(makeContext({ drawdownPercent: 0.29 }))
    expect(result.checks[7].pass).toBe(true)
  })

  it('fails when drawdown is exactly 30%', () => {
    const result = runPreTradeChecks(makeContext({ drawdownPercent: 0.30 }))
    expect(result.pass).toBe(false)
    expect(result.checks[7].pass).toBe(false)
  })

  // Check 9: Daily loss buffer
  it('fails when daily P&L at -4%', () => {
    const result = runPreTradeChecks(makeContext({ dailyPnlPercent: -0.04 }))
    expect(result.pass).toBe(false)
    expect(result.checks[8].pass).toBe(false)
    expect(result.checks[8].reason).toContain('-4.0%')
  })

  it('passes when daily P&L is -3.9%', () => {
    const result = runPreTradeChecks(makeContext({ dailyPnlPercent: -0.039 }))
    expect(result.checks[8].pass).toBe(true)
  })

  // Multiple failures
  it('reports all failing checks', () => {
    const result = runPreTradeChecks(makeContext({
      riskPercent: 0.05,
      dailyTradeCount: 10,
      openPositionCount: 8,
    }))
    expect(result.pass).toBe(false)
    const failures = result.checks.filter(c => !c.pass)
    expect(failures.length).toBe(3)
  })

  // Cluster limit with new 12-instrument clusters
  it('fails when cluster 1 (USD-shorts) has 2 positions and adding a third', () => {
    // GBP_USD is cluster 1, EUR_USD and AUD_USD already open (both cluster 1)
    const result = runPreTradeChecks(makeContext({
      instrument: 'GBP_USD',
      openInstruments: ['EUR_USD', 'AUD_USD'],
      leverage: 5,
    }))
    expect(result.checks[4].pass).toBe(false)
    expect(result.checks[4].reason).toContain('Cluster 1')
  })

  it('all 12 instruments have a defined cluster', () => {
    const instruments = [
      'EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD',
      'USD_JPY', 'XAU_USD', 'XAG_USD', 'BCO_USD',
      'EUR_GBP', 'US30_USD', 'US500_USD', 'GER40_EUR',
    ]
    for (const inst of instruments) {
      const result = runPreTradeChecks(makeContext({
        instrument: inst,
        openInstruments: [],
        leverage: 5,
      }))
      // Cluster check should NOT say "not in a defined cluster"
      expect(result.checks[4].reason).not.toContain('not in a defined cluster')
    }
  })
})
