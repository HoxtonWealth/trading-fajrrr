import {
  MAX_RISK_PER_TRADE,
  MAX_DAILY_TRADES,
  MAX_OPEN_POSITIONS,
  MAX_CLUSTER_POSITIONS,
  MAX_CORRELATION,
  MAX_SPREAD_MULTIPLIER,
  DAILY_LOSS_BUFFER,
  LEVERAGE_CAPS,
  INSTRUMENT_CLUSTERS,
} from './constants'

export interface CheckResult {
  pass: boolean
  reason: string
}

export interface PreTradeContext {
  riskPercent: number
  instrument: string
  units: number
  entryPrice: number
  leverage: number
  dailyTradeCount: number
  openPositionCount: number
  openInstruments: string[]
  correlations: Record<string, number> // instrument → correlation with proposed trade
  currentSpread: number
  averageSpread: number
  dailyPnlPercent: number // negative means loss
}

export interface PreTradeResult {
  pass: boolean
  checks: CheckResult[]
}

// Check 1: Max risk per trade
function checkMaxRisk(ctx: PreTradeContext): CheckResult {
  if (ctx.riskPercent > MAX_RISK_PER_TRADE) {
    return { pass: false, reason: `Risk ${(ctx.riskPercent * 100).toFixed(1)}% exceeds max ${MAX_RISK_PER_TRADE * 100}%` }
  }
  return { pass: true, reason: 'Risk per trade within limit' }
}

// Check 2: Leverage cap
function checkLeverage(ctx: PreTradeContext): CheckResult {
  const cap = LEVERAGE_CAPS[ctx.instrument] ?? 10
  if (ctx.leverage > cap) {
    return { pass: false, reason: `Leverage ${ctx.leverage.toFixed(1)}x exceeds cap ${cap}x for ${ctx.instrument}` }
  }
  return { pass: true, reason: 'Leverage within limit' }
}

// Check 3: Daily trade count
function checkDailyTradeCount(ctx: PreTradeContext): CheckResult {
  if (ctx.dailyTradeCount >= MAX_DAILY_TRADES) {
    return { pass: false, reason: `Daily trade count ${ctx.dailyTradeCount} reached max ${MAX_DAILY_TRADES}` }
  }
  return { pass: true, reason: 'Daily trade count within limit' }
}

// Check 4: Open positions
function checkOpenPositions(ctx: PreTradeContext): CheckResult {
  if (ctx.openPositionCount >= MAX_OPEN_POSITIONS) {
    return { pass: false, reason: `Open positions ${ctx.openPositionCount} reached max ${MAX_OPEN_POSITIONS}` }
  }
  return { pass: true, reason: 'Open position count within limit' }
}

// Check 5: Cluster limit
function checkClusterLimit(ctx: PreTradeContext): CheckResult {
  const cluster = INSTRUMENT_CLUSTERS[ctx.instrument]
  if (cluster === undefined) {
    return { pass: true, reason: 'Instrument not in a defined cluster' }
  }

  const clusterCount = ctx.openInstruments.filter(
    inst => INSTRUMENT_CLUSTERS[inst] === cluster
  ).length

  if (clusterCount >= MAX_CLUSTER_POSITIONS) {
    return { pass: false, reason: `Cluster ${cluster} has ${clusterCount} positions, max is ${MAX_CLUSTER_POSITIONS}` }
  }
  return { pass: true, reason: 'Cluster limit within bounds' }
}

// Check 6: Correlation
function checkCorrelation(ctx: PreTradeContext): CheckResult {
  for (const [inst, corr] of Object.entries(ctx.correlations)) {
    if (Math.abs(corr) > MAX_CORRELATION) {
      return { pass: false, reason: `Correlation with ${inst} is ${corr.toFixed(2)}, exceeds max ${MAX_CORRELATION}` }
    }
  }
  return { pass: true, reason: 'No high correlations with open positions' }
}

// Check 7: Spread filter
function checkSpread(ctx: PreTradeContext): CheckResult {
  if (ctx.averageSpread > 0 && ctx.currentSpread > ctx.averageSpread * MAX_SPREAD_MULTIPLIER) {
    return {
      pass: false,
      reason: `Spread ${ctx.currentSpread.toFixed(2)} exceeds ${MAX_SPREAD_MULTIPLIER}x average ${ctx.averageSpread.toFixed(2)}`,
    }
  }
  return { pass: true, reason: 'Spread within acceptable range' }
}

// Check 8: Daily loss buffer
function checkDailyLossBuffer(ctx: PreTradeContext): CheckResult {
  if (ctx.dailyPnlPercent <= -DAILY_LOSS_BUFFER) {
    return {
      pass: false,
      reason: `Daily P&L ${(ctx.dailyPnlPercent * 100).toFixed(1)}% hit buffer at -${DAILY_LOSS_BUFFER * 100}%`,
    }
  }
  return { pass: true, reason: 'Daily loss within buffer' }
}

/**
 * Run all 8 pre-trade checks. ALL must pass for a trade to execute.
 */
export function runPreTradeChecks(ctx: PreTradeContext): PreTradeResult {
  const checks = [
    checkMaxRisk(ctx),
    checkLeverage(ctx),
    checkDailyTradeCount(ctx),
    checkOpenPositions(ctx),
    checkClusterLimit(ctx),
    checkCorrelation(ctx),
    checkSpread(ctx),
    checkDailyLossBuffer(ctx),
  ]

  return {
    pass: checks.every(c => c.pass),
    checks,
  }
}
