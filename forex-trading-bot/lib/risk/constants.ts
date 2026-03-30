/**
 * IMMUTABLE RISK CONSTANTS
 *
 * ⛔ These values are NEVER modified by AI agents, self-learning loops,
 * or any automated process. They are hardcoded risk limits that always win.
 *
 * See blueprint Section 4: Risk Management Framework
 */

// --- Position Risk ---
export const MAX_RISK_PER_TRADE = 0.02       // 2% of equity per trade
export const MAX_DAILY_LOSS = 0.05            // 5% daily loss → halt trading
export const MAX_DRAWDOWN = 0.30              // 30% max drawdown → circuit breaker
export const DAILY_LOSS_BUFFER = 0.04         // 4% → stop opening new trades

// --- Trade Limits ---
export const MAX_DAILY_TRADES = 10
export const MAX_OPEN_POSITIONS = 6
export const MAX_CLUSTER_POSITIONS = 2

// --- Leverage Caps ---
export const LEVERAGE_CAPS: Record<string, number> = {
  // Major forex
  EUR_USD: 20,
  USD_JPY: 20,
  // Minor forex / crosses
  EUR_GBP: 15,
  // Commodities
  XAU_USD: 10,
  BCO_USD: 10,
  // Indices
  US30_USD: 10,
} as const

// --- Stop Loss ---
export const STOP_MULTIPLIER_TREND = 2.0       // 2x ATR for trend following
export const STOP_MULTIPLIER_MEAN_REV = 1.5    // 1.5x ATR for mean reversion

// --- Spread Filter ---
export const MAX_SPREAD_MULTIPLIER = 2.0       // No trade if spread > 2x average

// --- Correlation ---
export const MAX_CORRELATION = 0.7             // Pearson > 0.7 → halve size or skip
export const CORRELATION_WINDOW = 20           // 20-day rolling window

// --- Volatility Targeting ---
export const TARGET_ANNUAL_VOL = 0.15          // 15% annualised target

// --- Weekend Protocol ---
export const FRIDAY_TIGHTEN_HOUR_UTC = 19      // Friday 19:30 UTC
export const FRIDAY_TIGHTEN_MINUTE_UTC = 30
export const SUNDAY_REOPEN_HOUR_UTC = 22       // Sunday 22:00 UTC

// --- Circuit Breaker Recovery ---
export const CIRCUIT_BREAKER_HALT_HOURS = 48
export const FLASH_CRASH_THRESHOLD = 0.03      // 3% move in 5 minutes
export const FLASH_CRASH_HALT_HOURS = 24

// --- Self-Learning Bounds ---
export const MIN_DARWINIAN_WEIGHT = 0.3
export const MAX_DARWINIAN_WEIGHT = 2.5
export const MAX_EVOLUTION_ATTEMPTS_PER_MONTH = 2
export const SHADOW_TEST_DAYS = 5

// --- Correlation Clusters ---
export const INSTRUMENT_CLUSTERS: Record<string, number> = {
  EUR_USD: 1,   // Anti-USD
  USD_JPY: 2,   // JPY
  XAU_USD: 3,   // Metals
  BCO_USD: 4,   // Energy
  EUR_GBP: 5,   // Crosses
  US30_USD: 6,  // Indices
} as const
