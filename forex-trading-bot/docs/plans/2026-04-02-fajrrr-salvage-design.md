# Fajrrr-Trading Feature Salvage — Design Document

**Date:** 2026-04-02
**Status:** Approved — ready for implementation
**Context:** `fajrrr-trading/` was a duplicate project accidentally nested in the repo. It has been removed. These 6 unique features have been identified for porting into `forex-trading-bot/`.

---

## Implementation Order

1. **F — Kill Switch UI** (quick win, safety-critical)
2. **E — Trade Post-Mortem** (enhances learning loops)
3. **C — GDELT Geopolitical Data** (new data source)
4. **D — Weekly Instrument Discovery** (OpenRouter-based market research)
5. **A — Market Screener** (dynamic instrument selection)
6. **B — Scan Scheduler** (event-driven cron intervals)

## Architecture Decisions

- **All features integrate directly into `forex-trading-bot/`** — no monorepo, no new packages
- **All code in TypeScript strict mode** — matching existing codebase
- **OpenRouter replaces Perplexity** — for market research in Discovery feature
- **Market Screener is fully dynamic** — no fixed instrument set, screener picks whatever looks best globally
- **No new npm dependencies** — GDELT and all new APIs use native `fetch`

---

## Feature F: Kill Switch UI

### Purpose
Dashboard button to instantly halt all trading. Currently requires manual DB edit.

### Implementation

**New files:**
- `app/api/kill-switch/route.ts` — POST endpoint to toggle kill switch
- Dashboard component added to `app/dashboard/page.tsx`

**Database:**
- New row in `system_state` table: `key: 'kill_switch', value: 'active' | 'inactive'`
- Migration: `supabase/migrations/015_kill_switch.sql`

**Logic:**
- POST `/api/kill-switch` toggles the `kill_switch` row in `system_state`
- `lib/pipeline.ts` checks kill switch at the very top before running any pipeline logic
- If active: skip pipeline, log "Kill switch active — pipeline halted", send Telegram alert on first activation
- Dashboard shows red/green toggle button with current state
- Requires simple auth (check for a shared secret in request header) to prevent accidental triggers

**Integration points:**
- `lib/pipeline.ts` — add kill switch check at line ~30 (before any agent calls)
- `app/dashboard/page.tsx` — add KillSwitch component
- `lib/services/telegram.ts` — send alert on activation/deactivation

---

## Feature E: Trade Post-Mortem

### Purpose
Richer per-trade lesson extraction beyond simple win/loss. Tracks process quality independent of outcome.

### Implementation

**New files:**
- `lib/learning/post-mortem.ts` — lesson extraction from closed trades

**Database:**
- New table: `trade_lessons`
  - `id`, `trade_id` (FK), `instrument`, `direction`
  - `process_quality` (1-5 score — was the process good regardless of outcome?)
  - `entry_quality` (1-5 — timing, price level)
  - `exit_quality` (1-5 — held too long, cut too early, just right)
  - `would_take_again` (boolean)
  - `tags` (text[] — e.g., 'news-driven', 'trend-follow', 'mean-reversion', 'counter-trend')
  - `market_condition` (text — what was happening in the market)
  - `lesson` (text — what was learned)
  - `win_rate_context` (jsonb — rolling stats at time of trade)
  - `created_at`
- Migration: `supabase/migrations/016_trade_lessons.sql`

**Logic:**
- Called from existing `scorecard-updater.ts` after a trade closes
- Uses OpenRouter (cheap tier) to analyze the trade:
  - Input: trade entry/exit data, candle data around trade, agent reports, market conditions
  - Output: structured JSON with process_quality, entry_quality, exit_quality, tags, lesson, would_take_again
- `getRelevantLessons(instrument)` — fetches instrument-specific + general lessons for injection into agent prompts
- Lessons fed into chief analyst prompt for context on past mistakes/successes

**Integration points:**
- `lib/learning/scorecard-updater.ts` — call `extractPostMortem()` after scorecard update
- `lib/agents/chief-analyst.ts` — inject relevant lessons into system prompt
- `lib/learning/reflection-engine.ts` — use lessons as additional context

---

## Feature C: GDELT Geopolitical Data

### Purpose
Additional sentiment/news data source covering geopolitical events that Finnhub may miss.

### Implementation

**New files:**
- `lib/services/gdelt.ts` — GDELT API client

**API endpoints used (all free, no API key needed):**
- `https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=ArtList&format=json` — article search
- `https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=ToneChart&format=json` — tone timeline

**Functions:**
- `searchArticles(query: string, timespan?: string)` — fetch articles matching query (default 24h)
  - Returns: title, url, tone (positive/negative score), date, source
- `getToneTimeline(query: string, days?: number)` — tone trend over time (default 7 days)
  - Returns: daily average tone scores
- `getGeopoliticalSentiment(instruments: string[])` — maps instruments to geopolitical queries
  - XAU_USD → "gold price geopolitics war sanctions"
  - EUR_USD → "eurozone economy ECB policy"
  - USD_JPY → "japan yen BOJ monetary policy"
  - BCO_USD → "oil price OPEC supply demand"
  - US30_USD → "US economy stocks fed policy"
  - Generic forex → "forex currency central bank"

**Integration points:**
- `app/api/cron/ingest-news-sentiment/route.ts` — add GDELT fetch alongside Finnhub
- `lib/agents/sentiment-analyst.ts` — include GDELT data in sentiment analysis prompt
- Store results in existing `news_sentiment` table with `source: 'gdelt'`

---

## Feature D: Weekly Instrument Discovery

### Purpose
Uses OpenRouter to research which markets currently have edge, recommending instruments to add/remove from the active trading universe.

### Implementation

**New files:**
- `lib/intelligence/discovery.ts` — market research + instrument recommendation
- `app/api/cron/discover-instruments/route.ts` — weekly cron endpoint

**Database:**
- New table: `instrument_universe`
  - `id`, `instrument` (text), `status` ('active' | 'watchlist' | 'removed')
  - `added_reason` (text — why this instrument was added)
  - `removed_reason` (text — why it was removed, if applicable)
  - `discovery_date`, `last_traded`, `performance_score` (float)
  - `updated_at`
- Migration: `supabase/migrations/017_instrument_universe.sql`

**Logic:**
- Runs weekly (Sunday, after weekly review)
- Step 1: Analyze current instrument performance from `agent_scorecards` and `trades`
  - Which instruments are profitable? Which are losing?
  - Win rates, Sharpe ratios, average P&L per instrument
- Step 2: OpenRouter (strong tier) research prompt:
  - "Given current macro conditions, which forex pairs, commodities, and indices have the best risk-adjusted trading opportunities this week? Consider: central bank meetings, earnings season, geopolitical events, seasonal patterns, volatility regimes."
  - Include current portfolio performance as context
- Step 3: LLM returns structured JSON:
  - `add: [{instrument, reason, expected_regime}]`
  - `remove: [{instrument, reason}]`
  - `keep: [{instrument, reason}]`
- Step 4: Update `instrument_universe` table
- Step 5: Send Telegram summary of changes
- All other crons read from `instrument_universe` WHERE `status = 'active'` instead of hardcoded list

**Integration points:**
- `vercel.json` — add weekly cron schedule
- `app/api/cron/ingest-candles/route.ts` — read instruments from `instrument_universe` instead of hardcoded array
- `app/api/cron/run-pipeline/route.ts` — same change
- `lib/services/capital.ts` — instrument translation map needs to be dynamic (query Capital.com for available instruments)
- ALL crons that reference instrument lists need to read from DB

**Risk mitigation:**
- Minimum 3 instruments active at all times
- Maximum 12 instruments (to avoid spreading capital too thin)
- New instruments start with minimum position size for first 5 trades (learning phase)
- Instrument can only be removed if no open positions exist

---

## Feature A: Market Screener

### Purpose
Dynamically scores and ranks instruments to find the best trading opportunities right now. Replaces static "run pipeline on all instruments" with prioritized selection.

### Implementation

**New files:**
- `lib/intelligence/screener.ts` — instrument scoring and ranking

**Logic:**
- Called at the START of each pipeline run (hourly)
- Step 1: For each instrument in `instrument_universe` (active), calculate scores:
  - `volatility_score` — ATR percentile vs 30-day average (higher = more opportunity)
  - `trend_score` — ADX strength + EMA alignment (clear trends = higher)
  - `news_catalyst_score` — recent Finnhub + GDELT activity (more news = more movement)
  - `calendar_proximity_score` — upcoming economic events affecting this instrument
  - `historical_edge_score` — bot's win rate on this instrument from scorecards
  - `pm_signal_score` — prediction market signals relevant to this instrument
- Step 2: Weighted composite score (weights tunable, stored in DB):
  - Default: volatility 0.2, trend 0.25, news 0.15, calendar 0.1, edge 0.2, pm 0.1
- Step 3: Rank instruments, select top N for this pipeline run
  - N = based on available margin and max positions (from risk constants)
  - Minimum score threshold to avoid trading in dead markets
- Step 4: Return ranked list to pipeline

**Integration points:**
- `lib/pipeline.ts` — call screener before iterating instruments
- `app/api/cron/run-pipeline/route.ts` — pass screener results to pipeline
- Uses data already in Supabase (candles, news_sentiment, prediction_signals, agent_scorecards)

**No LLM call needed** — this is pure data scoring. Fast and deterministic.

---

## Feature B: Scan Scheduler

### Purpose
Adjusts cron execution frequency based on market session and proximity to economic events. Runs more often during high-activity windows, less during quiet periods.

### Implementation

**New files:**
- `lib/intelligence/scan-scheduler.ts` — scheduling logic
- `app/api/cron/scan-scheduler/route.ts` — meta-cron that triggers other crons

**Market sessions (UTC):**
- Asian: 00:00–08:00 (low activity for forex)
- London: 08:00–16:00 (high activity)
- New York: 13:00–21:00 (high activity)
- London/NY Overlap: 13:00–16:00 (highest activity)
- Off-hours: 21:00–00:00 (low activity)

**Event proximity adjustments:**
- 4+ hours before high-impact event: normal schedule
- 1-4 hours before: increase pipeline frequency to 30min
- 0-1 hour before: increase to 15min (pre-positioning)
- 0-1 hour after: increase to 15min (capture reaction)
- 1-4 hours after: back to 30min

**Approach — Two options:**

**Option 1 (Simpler, recommended): Smart skip pattern**
- Keep all Vercel crons at their current fast intervals
- `scan-scheduler.ts` exports `shouldRunNow(cronName: string): boolean`
- Each cron route calls `shouldRunNow()` at the top — if false, return early
- Logic based on current market session + upcoming events
- No Vercel config changes needed

**Option 2 (Complex): Dynamic cron management via Vercel API**
- Use Vercel API to dynamically update cron schedules
- More precise but adds API dependency and complexity

**Recommended: Option 1.** Simpler, no external API dependency, same result.

**Integration points:**
- Every `app/api/cron/*/route.ts` — add `shouldRunNow()` check at top
- `lib/intelligence/scan-scheduler.ts` — reads from `economic_calendar` table for event proximity
- `vercel.json` — set pipeline cron to run every 15min (fastest needed interval), scheduler decides if it actually executes

**Session-based pipeline frequency:**
| Session | Pipeline runs | Candle ingestion |
|---------|--------------|-----------------|
| Asian | Every 2 hours | Every 30 min |
| London | Every 30 min | Every 15 min |
| NY | Every 30 min | Every 15 min |
| Overlap | Every 15 min | Every 15 min |
| Off-hours | Every 4 hours | Every 30 min |

---

## Database Migrations Summary

### 015_kill_switch.sql
```sql
INSERT INTO system_state (key, value, updated_at)
VALUES ('kill_switch', 'inactive', now())
ON CONFLICT (key) DO NOTHING;
```

### 016_trade_lessons.sql
```sql
CREATE TABLE trade_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES trades(id),
  instrument text NOT NULL,
  direction text NOT NULL,
  process_quality smallint CHECK (process_quality BETWEEN 1 AND 5),
  entry_quality smallint CHECK (entry_quality BETWEEN 1 AND 5),
  exit_quality smallint CHECK (exit_quality BETWEEN 1 AND 5),
  would_take_again boolean,
  tags text[] DEFAULT '{}',
  market_condition text,
  lesson text,
  win_rate_context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lessons_instrument ON trade_lessons(instrument);
CREATE INDEX idx_lessons_created ON trade_lessons(created_at DESC);
```

### 017_instrument_universe.sql
```sql
CREATE TABLE instrument_universe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument text UNIQUE NOT NULL,
  display_name text,
  asset_class text, -- 'forex', 'commodity', 'index'
  status text DEFAULT 'active' CHECK (status IN ('active', 'watchlist', 'removed')),
  added_reason text,
  removed_reason text,
  discovery_date timestamptz DEFAULT now(),
  last_traded timestamptz,
  performance_score float DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Seed with current 6 instruments
INSERT INTO instrument_universe (instrument, display_name, asset_class, status, added_reason) VALUES
  ('XAU_USD', 'Gold', 'commodity', 'active', 'Original instrument set'),
  ('EUR_GBP', 'EUR/GBP', 'forex', 'active', 'Original instrument set'),
  ('EUR_USD', 'EUR/USD', 'forex', 'active', 'Original instrument set'),
  ('USD_JPY', 'USD/JPY', 'forex', 'active', 'Original instrument set'),
  ('BCO_USD', 'Brent Oil', 'commodity', 'active', 'Original instrument set'),
  ('US30_USD', 'Dow Jones', 'index', 'active', 'Original instrument set');

CREATE INDEX idx_universe_status ON instrument_universe(status);
```

---

## New/Modified Files Summary

| File | Action | Feature |
|------|--------|---------|
| `app/api/kill-switch/route.ts` | NEW | F |
| `app/dashboard/page.tsx` | MODIFY | F |
| `lib/pipeline.ts` | MODIFY | F, A |
| `lib/learning/post-mortem.ts` | NEW | E |
| `lib/learning/scorecard-updater.ts` | MODIFY | E |
| `lib/agents/chief-analyst.ts` | MODIFY | E |
| `lib/services/gdelt.ts` | NEW | C |
| `app/api/cron/ingest-news-sentiment/route.ts` | MODIFY | C |
| `lib/agents/sentiment-analyst.ts` | MODIFY | C |
| `lib/intelligence/discovery.ts` | NEW | D |
| `app/api/cron/discover-instruments/route.ts` | NEW | D |
| `lib/intelligence/screener.ts` | NEW | A |
| `app/api/cron/run-pipeline/route.ts` | MODIFY | A |
| `lib/intelligence/scan-scheduler.ts` | NEW | B |
| `app/api/cron/scan-scheduler/route.ts` | NEW | B |
| All cron routes | MODIFY | B |
| `vercel.json` | MODIFY | B, D |
| `lib/types/index.ts` | MODIFY | All |
| `supabase/migrations/015_kill_switch.sql` | NEW | F |
| `supabase/migrations/016_trade_lessons.sql` | NEW | E |
| `supabase/migrations/017_instrument_universe.sql` | NEW | D, A |

---

## Testing Strategy

- **Kill Switch:** Test toggle API, test pipeline halts when active, test Telegram alert
- **Post-Mortem:** Test LLM output parsing, test lesson retrieval by instrument
- **GDELT:** Test API client, test query mapping per instrument, test graceful failure
- **Discovery:** Test instrument add/remove logic, test minimum 3 / maximum 12 constraints
- **Screener:** Test scoring math, test ranking, test minimum score threshold
- **Scan Scheduler:** Test session detection, test event proximity logic, test shouldRunNow() for each session

All risk-critical tests (kill switch, screener score thresholds, instrument min/max) are mandatory per project rules.

---

## Absolute Rules (unchanged)
- NEVER modify `risk/constants.ts`
- NEVER skip pre-trade checks
- NEVER let LLM output override risk rules
- Kill switch is additive safety — it does NOT replace existing risk gates
- Screener scores do NOT override risk checks — a high-scoring instrument still goes through all 8 gates
