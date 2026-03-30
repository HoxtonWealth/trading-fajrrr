# Epic 2 — Multi-Strategy (Weeks 5–8)

## Goal
Add mean reversion strategy, regime switching, LLM sentiment, news ingestion. Expand to EUR/GBP. Bot handles two strategies and switches between them automatically.

## Go/No-Go Gate
- [ ] 100+ paper trades total
- [ ] Sharpe ratio > 0.5
- [ ] Regime switching works correctly (trend ↔ mean reversion)
- [ ] 10 days fully autonomous

## Prerequisites
Epic 1 gate PASSED.

---

## Story 2.1 — Mean Reversion Indicators (RSI, Bollinger Bands)

**As a** developer  
**I want** RSI and Bollinger Band indicators  
**So that** I can detect mean reversion entry signals

### Tasks
- Create `lib/indicators/rsi.ts` — RSI(14)
- Create `lib/indicators/bollinger.ts` — BB(20,2): upper, middle, lower bands
- Add `rsi_14`, `bb_upper`, `bb_middle`, `bb_lower` columns to `indicators` table
- Write tests with known data
- Update `ingest-candles` cron to compute these for EUR_GBP

### Acceptance Criteria

**Given** 20 candles of known data  
**When** `calculateRSI(candles, 14)` is called  
**Then** output matches manual RSI calculation

**Given** 25 candles  
**When** `calculateBollingerBands(candles, 20, 2)` is called  
**Then** upper = SMA + 2×stddev, lower = SMA - 2×stddev, middle = SMA

### Blueprint Reference
- Section 2: Layer 2b (Mean reversion)
- Section 12: Bollinger entry formula

---

## Story 2.2 — Mean Reversion Strategy

**As a** developer  
**I want** the mean reversion signal logic  
**So that** the bot can trade range-bound markets on EUR/GBP

### Tasks
- Create `lib/strategies/mean-reversion.ts`
- Entry: BB(20,2) touch + RSI(14) < 30 + ADX(14) < 20 → long
- Entry: BB(20,2) upper touch + RSI(14) > 70 + ADX(14) < 20 → short
- Exit: Middle Bollinger Band OR stop hit
- Stop: 1.5x ATR(14) fixed stop beyond entry BB
- Write tests

### Acceptance Criteria

**Given** price touches lower BB, RSI=25, ADX=17  
**When** strategy evaluates  
**Then** returns `{ signal: 'long', stopLoss: lowerBB - 1.5×ATR }`

**Given** price touches lower BB, RSI=25, ADX=27  
**When** strategy evaluates  
**Then** returns `{ signal: 'none' }` (ADX too high for mean reversion)

### Blueprint Reference
- Section 2: Layer 2b

---

## Story 2.3 — Regime Detection & Strategy Switching

**As a** developer  
**I want** ADX-based regime detection that activates the right strategy  
**So that** the bot uses trend following in trends and mean reversion in ranges

### Tasks
- Create `lib/strategies/regime-detector.ts`
- ADX > 25 → trending → use trend following
- ADX < 20 → ranging → use mean reversion
- ADX 20–25 → transition → both strategies at 50% position size
- Update `pipeline.ts` to use regime detector before strategy selection
- Write tests for all 3 regimes

### Acceptance Criteria

**Given** ADX = 30  
**When** regime is detected  
**Then** returns `{ regime: 'trending', strategies: ['trend'], sizeMultiplier: 1.0 }`

**Given** ADX = 15  
**When** regime is detected  
**Then** returns `{ regime: 'ranging', strategies: ['mean_reversion'], sizeMultiplier: 1.0 }`

**Given** ADX = 22  
**When** regime is detected  
**Then** returns `{ regime: 'transition', strategies: ['trend', 'mean_reversion'], sizeMultiplier: 0.5 }`

### Blueprint Reference
- Section 2: Layer 1 (Regime detection)

---

## Story 2.4 — Multi-Instrument Support (EUR/GBP)

**As a** developer  
**I want** the pipeline to handle multiple instruments  
**So that** EUR/GBP can trade alongside XAU/USD

### Tasks
- Update `ingest-candles` to fetch candles for both XAU_USD and EUR_GBP
- Update pipeline to loop over active instruments
- Add correlation check between open positions (blueprint Section 4 check #6)
- Create `risk/correlation.ts` — 20-day Pearson correlation
- Update pre-trade checks to include cluster limit (check #5)

### Acceptance Criteria

**Given** 2 instruments are active  
**When** the pipeline runs  
**Then** it evaluates signals for both independently

**Given** XAU_USD and EUR_GBP have 20-day Pearson > 0.7  
**When** a trade is proposed for the second  
**Then** pre-trade check #6 halves the position size or skips

### Blueprint Reference
- Section 3: Instrument universe
- Section 4: Gate 1 checks #5 and #6

---

## Story 2.5 — News Ingestion & LLM Sentiment

**As a** developer  
**I want** news headlines scored by an LLM every 4 hours  
**So that** sentiment can bias position sizes

### Tasks
- Create Supabase table: `news_sentiment`
- Create `lib/services/finnhub.ts` — fetch forex news
- Create `lib/services/openrouter.ts` — typed OpenRouter client
- Create `app/api/cron/ingest-news-sentiment/route.ts`
- Fetch headlines → send to cheap LLM → get per-instrument sentiment score (-1 to +1)
- Store in `news_sentiment` table
- Accounts: create Finnhub free account, use OpenRouter key

### Acceptance Criteria

**Given** Finnhub returns 10 headlines  
**When** the cron runs  
**Then** each instrument gets a sentiment score stored in `news_sentiment`

**Given** the OpenRouter API fails  
**When** the cron runs  
**Then** it logs the error and completes without crashing (sentiment = 0 default)

### Blueprint Reference
- Section 7: Financial news, Combined LLM scoring call
- Section 2: Layer 3 (LLM sentiment bias)

---

## Story 2.6 — Sentiment Modifier in Pipeline

**As a** developer  
**I want** sentiment scores to modify position sizes  
**So that** high-conviction signals get larger positions

### Tasks
- Update `pipeline.ts` to read latest sentiment from `news_sentiment`
- Apply modifier: score > +0.5 on long → ×1.25 size. Score < -0.5 on long → ×0 (skip).
- Sentiment NEVER overrides entry/exit signals — only modifies size
- Sentiment NEVER overrides risk limits — modifier applied BEFORE cap check

### Acceptance Criteria

**Given** a long signal on XAU_USD with sentiment = +0.7  
**When** position size is calculated  
**Then** size is multiplied by 1.25 (but still capped at 2% risk)

**Given** a long signal on XAU_USD with sentiment = -0.8  
**When** position size is calculated  
**Then** trade is skipped (sentiment opposes direction)

**Given** no sentiment data available  
**When** a signal is generated  
**Then** position size is unmodified (modifier = 1.0)

### Blueprint Reference
- Section 2: Layer 3
- Section 4: Position sizing, sentiment modifier

---

## Story 2.7 — Weekend Handler & Trading Sessions

**As a** developer  
**I want** the bot to handle weekends and trading sessions correctly  
**So that** positions are protected during market closure

### Tasks
- Add weekend logic: Friday 19:30 UTC → tighten stops to 1x ATR, close MR, block entries
- Sunday 22:00 UTC → resume normal trading
- Add `system_state` table for coordination (Phase 1 can use simple flag)
- Update pipeline to check system state before trading

### Acceptance Criteria

**Given** it is Friday 19:30 UTC  
**When** the weekend handler runs  
**Then** all mean reversion positions are closed, trend stops tightened to 1x ATR, new entries blocked

**Given** it is Sunday 22:00 UTC  
**When** the system checks  
**Then** trading resumes normally

### Blueprint Reference
- Section 4: Gate 2 (weekend protocol)
