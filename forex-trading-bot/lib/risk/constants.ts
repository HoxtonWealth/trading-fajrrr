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
export const MAX_OPEN_POSITIONS = 8
export const MAX_CLUSTER_POSITIONS = 2

// --- Leverage Caps ---
export const LEVERAGE_CAPS: Record<string, number> = {
  // Major forex
  EUR_USD: 20,
  USD_JPY: 20,
  AUD_USD: 20,
  GBP_USD: 20,
  // Minor forex / crosses
  EUR_GBP: 15,
  NZD_USD: 15,
  // Commodities
  XAU_USD: 15,
  XAG_USD: 15,
  BCO_USD: 15,
  // Indices
  US30_USD: 15,
  US500_USD: 15,
  GER40_EUR: 15,
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
export const TARGET_ANNUAL_VOL = 0.20          // 20% annualised target

// --- Weekend Protocol ---
export const FRIDAY_TIGHTEN_HOUR_UTC = 19      // Friday 19:30 UTC
export const FRIDAY_TIGHTEN_MINUTE_UTC = 30
export const SUNDAY_REOPEN_HOUR_UTC = 22       // Sunday 22:00 UTC

// --- Circuit Breaker Recovery ---
export const CIRCUIT_BREAKER_HALT_HOURS = 24
export const FLASH_CRASH_THRESHOLD = 0.03      // 3% move in 5 minutes
export const FLASH_CRASH_HALT_HOURS = 24

// --- Self-Learning Bounds ---
export const MIN_DARWINIAN_WEIGHT = 0.3
export const MAX_DARWINIAN_WEIGHT = 2.5
export const MAX_EVOLUTION_ATTEMPTS_PER_MONTH = 2
export const SHADOW_TEST_DAYS = 5

// --- Correlation Clusters ---
export const INSTRUMENT_CLUSTERS: Record<string, number> = {
  // Cluster 1: USD-shorts (all move together when USD weakens)
  EUR_USD: 1,
  GBP_USD: 1,
  AUD_USD: 1,
  NZD_USD: 1,
  // Cluster 2: JPY (unique BoJ policy driver)
  USD_JPY: 2,
  // Cluster 3: Metals (highly correlated)
  XAU_USD: 3,
  XAG_USD: 3,
  // Cluster 4: Energy
  BCO_USD: 4,
  // Cluster 5: Crosses
  EUR_GBP: 5,
  // Cluster 6: Indices (correlated risk-on/risk-off)
  US30_USD: 6,
  US500_USD: 6,
  GER40_EUR: 6,
} as const
