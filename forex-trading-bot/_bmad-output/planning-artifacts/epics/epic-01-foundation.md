# Epic 1 — Foundation (Weeks 1–4)

## Goal
Get a working trend-following bot on XAU/USD with risk management, running autonomously on paper trading via OANDA practice account.

## Go/No-Go Gate
- [ ] 50+ paper trades executed
- [ ] Positive expectancy (avg win × win rate > avg loss × loss rate)
- [ ] Circuit breakers tested and verified
- [ ] 5 days fully autonomous (no manual intervention)

---

## Story 1.1 — Project Setup & Supabase Tables

**As a** developer  
**I want** the Next.js project initialized with Supabase connected  
**So that** I have a working foundation to build on

### Tasks
- Initialize Next.js project with TypeScript strict mode
- Install dependencies: `@supabase/supabase-js`
- Create `lib/services/supabase.ts` (typed client)
- Create `.env.local` from `.env.example`
- Create 4 Supabase tables: `candles`, `indicators`, `trades`, `equity_snapshots`
- Create `lib/types/database.ts` with TypeScript interfaces for all 4 tables
- Save SQL migrations in `supabase/migrations/`

### Acceptance Criteria

**Given** the project is cloned and `.env.local` is filled in  
**When** I run `npm run dev`  
**Then** the Next.js app starts without errors

**Given** the Supabase tables exist  
**When** I insert a test row into `candles`  
**Then** the row appears in Supabase dashboard and can be read back via the TypeScript client

### Table Schemas

**candles:**
- `id` UUID PK
- `instrument` TEXT (e.g., 'XAU_USD')
- `granularity` TEXT (e.g., 'H4')
- `time` TIMESTAMPTZ
- `open` DECIMAL
- `high` DECIMAL
- `low` DECIMAL
- `close` DECIMAL
- `volume` INTEGER
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(instrument, granularity, time)

**indicators:**
- `id` UUID PK
- `instrument` TEXT
- `granularity` TEXT
- `time` TIMESTAMPTZ
- `ema_20` DECIMAL
- `ema_50` DECIMAL
- `adx_14` DECIMAL
- `atr_14` DECIMAL
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(instrument, granularity, time)

**trades:**
- `id` UUID PK
- `instrument` TEXT
- `direction` TEXT ('long' or 'short')
- `strategy` TEXT ('trend' or 'mean_reversion')
- `entry_price` DECIMAL
- `exit_price` DECIMAL NULL
- `stop_loss` DECIMAL
- `units` INTEGER
- `risk_percent` DECIMAL
- `status` TEXT ('open', 'closed', 'cancelled')
- `opened_at` TIMESTAMPTZ
- `closed_at` TIMESTAMPTZ NULL
- `pnl` DECIMAL NULL
- `close_reason` TEXT NULL
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**equity_snapshots:**
- `id` UUID PK
- `equity` DECIMAL
- `balance` DECIMAL
- `unrealized_pnl` DECIMAL
- `open_positions` INTEGER
- `daily_pnl` DECIMAL
- `drawdown_percent` DECIMAL
- `created_at` TIMESTAMPTZ DEFAULT NOW()

---

## Story 1.2 — OANDA v20 Client

**As a** developer  
**I want** a typed OANDA API client  
**So that** I can fetch candles, check account status, and place orders

### Tasks
- Create `lib/services/oanda.ts`
- Implement: `fetchCandles(instrument, granularity, count)`
- Implement: `getAccountSummary()`
- Implement: `placeMarketOrder(instrument, units, stopLoss)`
- Implement: `closePosition(tradeId)`
- Implement: `getOpenPositions()`
- Handle errors: rate limits, network failures, invalid responses
- Use native `fetch` (no axios)

### Acceptance Criteria

**Given** valid OANDA API credentials  
**When** I call `fetchCandles('XAU_USD', 'H4', 100)`  
**Then** I receive an array of 100 candle objects with open/high/low/close/volume

**Given** valid OANDA API credentials  
**When** I call `getAccountSummary()`  
**Then** I receive equity, balance, unrealized P&L, and margin info

**Given** valid OANDA API credentials  
**When** I call `placeMarketOrder('XAU_USD', 1, 2300.00)`  
**Then** an order is placed on the practice account and a trade ID is returned

**Given** the OANDA API is unreachable  
**When** any client method is called  
**Then** a descriptive error is thrown (not a generic network error)

### Blueprint Reference
- Section 10: OANDA v20 REST
- `memory/dependencies.md`: OANDA API quirks (instrument format, base URL)

---

## Story 1.3 — Candle Ingestion Cron

**As a** developer  
**I want** candles automatically fetched and stored every 15 minutes  
**So that** the bot always has fresh price data

### Tasks
- Create `app/api/cron/ingest-candles/route.ts`
- Fetch H4 candles for XAU_USD from OANDA
- Compute indicators (EMA 20, EMA 50, ADX 14, ATR 14) — see Story 1.4
- Upsert candles into `candles` table (avoid duplicates)
- Upsert indicator values into `indicators` table
- Add cron schedule to `vercel.json`
- Protect endpoint with `CRON_SECRET` header check

### Acceptance Criteria

**Given** the cron runs every 15 minutes  
**When** new H4 candles are available from OANDA  
**Then** they are inserted into `candles` with no duplicates

**Given** candles are inserted  
**When** indicators are computed  
**Then** matching rows appear in `indicators` with correct EMA, ADX, ATR values

**Given** the OANDA API fails  
**When** the cron runs  
**Then** it returns a 500 with error details (does not crash silently)

### Workflow
Follow `_bmad-output/workflows/create-cron-endpoint.md`

---

## Story 1.4 — Technical Indicators (EMA, ADX, ATR)

**As a** developer  
**I want** pure functions for EMA, ADX, and ATR  
**So that** the bot can detect trends and calculate stop distances

### Tasks
- Create `lib/indicators/ema.ts` — Exponential Moving Average
- Create `lib/indicators/adx.ts` — Average Directional Index
- Create `lib/indicators/atr.ts` — Average True Range
- Write tests for each with known input/output pairs
- All functions are pure: input candles → output numbers

### Acceptance Criteria

**Given** 50 candles of known data  
**When** I call `calculateEMA(candles, 20)`  
**Then** the output matches manual calculation within 0.01% tolerance

**Given** 30 candles of known data  
**When** I call `calculateADX(candles, 14)`  
**Then** the output matches the ADX formula from blueprint Section 12

**Given** 20 candles of known data  
**When** I call `calculateATR(candles, 14)`  
**Then** the output matches manual ATR calculation

**Given** an empty candle array  
**When** any indicator function is called  
**Then** it returns an empty array (no crash)

### Workflow
Follow `_bmad-output/workflows/create-indicator.md`

### Blueprint Reference
- Section 12: Key formulas reference

---

## Story 1.5 — Equity Snapshot Cron

**As a** developer  
**I want** account equity tracked every 5 minutes  
**So that** drawdown and daily P&L can be monitored

### Tasks
- Create `app/api/cron/ingest-equity/route.ts`
- Call `oanda.getAccountSummary()`
- Compute: `drawdown_percent = (peak_equity - current_equity) / peak_equity × 100`
- Compute: `daily_pnl` from first snapshot of the day
- Insert into `equity_snapshots` table
- Add cron to `vercel.json` (every 5 min)

### Acceptance Criteria

**Given** the cron runs every 5 minutes  
**When** the OANDA account has activity  
**Then** a new row in `equity_snapshots` reflects current equity and drawdown

**Given** equity dropped from $5000 peak to $4500  
**When** `drawdown_percent` is computed  
**Then** it equals 10.0

**Given** today's first snapshot was $5000 and current is $4950  
**When** `daily_pnl` is computed  
**Then** it equals -$50

### Workflow
Follow `_bmad-output/workflows/create-cron-endpoint.md`

---

## Story 1.6 — Risk Constants & Position Sizer

**As a** developer  
**I want** immutable risk constants and a position sizing function  
**So that** no trade ever exceeds the risk limits defined in the blueprint

### Tasks
- Create `risk/constants.ts` — IMMUTABLE values (see blueprint Section 4)
- Create `risk/position-sizer.ts` — Half-Kelly + ATR-based sizing
- Write extensive tests for position sizer (edge cases!)

### Acceptance Criteria

**Given** `risk/constants.ts` exists  
**When** I read the file  
**Then** it contains: MAX_RISK_PER_TRADE=0.02, MAX_DAILY_LOSS=0.05, MAX_DRAWDOWN=0.30, MAX_DAILY_TRADES=10, MAX_OPEN_POSITIONS=6, and all leverage caps from blueprint Section 4

**Given** equity=$5000, ATR=15, stop_multiplier=2.0, risk_percent=0.02  
**When** I call `calculatePositionSize()`  
**Then** units = (5000 × 0.02) / (15 × 2.0) = 3.33 → rounded down to 3

**Given** Kelly suggests risk of 5%  
**When** Half-Kelly is applied  
**Then** result is 2.5%, but CAPPED at 2% (max risk per trade)

**Given** equity is 0 or negative  
**When** `calculatePositionSize()` is called  
**Then** it returns 0 (no trade)

### Blueprint Reference
- Section 4: Risk management framework
- Section 12: Kelly criterion, ATR stop loss, volatility targeting

---

## Story 1.7 — Pre-Trade Checks (8 Gates)

**As a** developer  
**I want** all 8 pre-trade checks implemented  
**So that** no trade executes unless every safety gate passes

### Tasks
- Create `risk/pre-trade-checks.ts`
- Implement all 8 checks from blueprint Section 4 Gate 1
- Each check is a separate function returning `{ pass: boolean, reason: string }`
- Master function `runPreTradeChecks()` runs all 8, returns combined result
- Write tests for each check individually (pass AND fail cases)

### Acceptance Criteria

**Given** a proposed trade with risk = 3% of equity  
**When** check #1 (max risk per trade) runs  
**Then** it returns `{ pass: false, reason: 'Risk 3% exceeds max 2%' }`

**Given** 10 trades already placed today  
**When** check #3 (daily trade count) runs  
**Then** it returns `{ pass: false, reason: 'Daily trade count 10 reached max 10' }`

**Given** 6 positions already open  
**When** check #4 (open positions) runs  
**Then** it returns `{ pass: false, reason: 'Open positions 6 reached max 6' }`

**Given** all 8 checks pass  
**When** `runPreTradeChecks()` runs  
**Then** it returns `{ pass: true, checks: [all 8 with pass: true] }`

**Given** any 1 check fails  
**When** `runPreTradeChecks()` runs  
**Then** it returns `{ pass: false }` with the failing check identified

### Blueprint Reference
- Section 4: Gate 1 table (all 8 checks)

---

## Story 1.8 — Trend Following Strategy

**As a** developer  
**I want** the trend following signal logic  
**So that** the bot can detect EMA crossover entries and exits on XAU/USD

### Tasks
- Create `lib/strategies/trend-following.ts`
- Entry signal: EMA(20) crosses above EMA(50) AND ADX(14) > 25 → long
- Entry signal: EMA(20) crosses below EMA(50) AND ADX(14) > 25 → short
- Exit signal: EMA crossover reversal, OR ADX < 20, OR trailing stop hit
- Stop: 2x ATR(14) trailing stop
- Returns: `{ signal: 'long' | 'short' | 'none', stopLoss: number, exitSignal: boolean }`
- Write tests with known indicator data

### Acceptance Criteria

**Given** EMA(20) just crossed above EMA(50) and ADX = 28  
**When** the strategy evaluates  
**Then** it returns `{ signal: 'long', stopLoss: close - 2×ATR }`

**Given** EMA(20) is above EMA(50) and ADX = 18  
**When** the strategy evaluates  
**Then** it returns `{ signal: 'none' }` (ADX too low)

**Given** an open long position and EMA(20) crosses below EMA(50)  
**When** the strategy evaluates  
**Then** it returns `{ exitSignal: true, reason: 'ema_crossover_reversal' }`

### Blueprint Reference
- Section 2: Layer 2a (Trend following)

---

## Story 1.9 — Simplified Pipeline (Technical Only)

**As a** developer  
**I want** a pipeline that reads indicators, generates signals, checks risk, and records trades  
**So that** the bot can run end-to-end on XAU/USD without LLM agents

### Tasks
- Create `lib/pipeline.ts`
- Step 1: Read latest indicators from Supabase for XAU_USD
- Step 2: Run trend following strategy
- Step 3: If signal → calculate position size
- Step 4: Run all 8 pre-trade checks
- Step 5: If all pass → write to `trades` table (status: 'pending')
- Step 6: Return decision summary
- Create `app/api/cron/run-pipeline/route.ts` — calls pipeline on H4 candle schedule

### Acceptance Criteria

**Given** indicators show a valid long signal with all risk checks passing  
**When** the pipeline runs  
**Then** a row is inserted into `trades` with status 'pending', correct units, and stop loss

**Given** indicators show a signal but risk check #1 fails  
**When** the pipeline runs  
**Then** no trade is created, and the pipeline logs the rejection reason

**Given** indicators show no signal  
**When** the pipeline runs  
**Then** no trade is created, pipeline returns `{ action: 'none' }`

### Workflow
Follow `_bmad-output/workflows/create-cron-endpoint.md`

---

## Story 1.10 — Deploy to Vercel & Verify

**As a** developer  
**I want** the bot deployed to Vercel with crons running  
**So that** data accumulates automatically without manual intervention

### Tasks
- Connect GitHub repo to Vercel
- Configure environment variables in Vercel dashboard
- Configure `vercel.json` with all Phase 1 cron schedules
- Deploy and verify crons trigger on schedule
- Verify data appears in Supabase tables
- End-of-week check: 48+ hours of continuous data

### Acceptance Criteria

**Given** the project is deployed to Vercel  
**When** 48 hours pass  
**Then** `candles` table has continuous H4 data for XAU_USD with no gaps

**Given** crons are running  
**When** I check `equity_snapshots`  
**Then** snapshots exist every ~5 minutes

**Given** an OANDA API error occurs during a cron  
**When** the next cron runs  
**Then** it recovers and continues normally (no permanent failure state)

---

## Story 1.11 — Scorecard System (SQL-Based)

**As a** developer  
**I want** every trade prediction logged and scored  
**So that** I can track strategy performance over time

### Tasks
- Create Supabase table: `agent_scorecards`
- Create `lib/learning/scorecard-updater.ts`
- After each trade closes: compare entry signal vs actual outcome
- Track: win/loss, P&L, accuracy per instrument, per strategy
- Create `app/api/cron/update-scorecards/route.ts` (daily at 00:00)
- No LLM needed — pure SQL aggregation

### Acceptance Criteria

**Given** 10 trades have closed  
**When** the scorecard updater runs  
**Then** `agent_scorecards` shows win rate, avg P&L, and accuracy per instrument

**Given** no trades have closed since last update  
**When** the scorecard updater runs  
**Then** it completes without error (no-op)

### Table Schema

**agent_scorecards:**
- `id` UUID PK
- `agent` TEXT (Phase 1: 'technical_trend')
- `instrument` TEXT
- `total_trades` INTEGER
- `wins` INTEGER
- `losses` INTEGER
- `win_rate` DECIMAL
- `avg_pnl` DECIMAL
- `total_pnl` DECIMAL
- `last_updated` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ DEFAULT NOW()
