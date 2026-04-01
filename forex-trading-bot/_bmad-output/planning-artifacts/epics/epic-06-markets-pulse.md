# Epic: Global Markets Pulse

## Overview
Add a `/markets` page to the Fajrrr Trading dashboard providing daily global market monitoring: 28 instruments across 6 asset classes, AI-generated morning briefing, geopolitical risk headlines, and economic calendar.

## PRD Reference
`_planning/artifacts/prd-markets-pulse.md`

## Architecture Reference
`_planning/artifacts/architecture-markets-pulse.md`

## Key Architecture Decisions
- AD-MP-01: Refresh route lives in dashboard (Vercel), not agent (Render)
- AD-MP-02: Capital.com for tradable instruments, Yahoo Finance for the rest
- AD-MP-03: Fresh Capital.com session auth per refresh (sessions expire after 10min)
- AD-MP-04: Internal names stay underscore format (EUR_USD), translate to epics (EURUSD) at API boundary only
- AD-MP-05: 3 new Supabase tables (market_assets, market_prices, market_analyses)
- AD-MP-06: Idempotent upserts to prevent duplicates
- AD-MP-07: DeepSeek via OpenRouter for daily AI analysis
- AD-MP-08: Dashboard reads existing news_cache and economic_calendar from agent
- AD-MP-09: Frontend reads Supabase directly (same pattern as existing components)

## Dependencies
- Supabase database (existing)
- Capital.com REST API (existing in agent — credentials must be added to Vercel)
- OpenRouter API (existing in Vercel)
- GDELT API (existing in agent — free, no key needed)
- Finnhub API (existing in agent — economic calendar)
- yahoo-finance2 npm package (new dependency in dashboard)

---

## Story MP.1 — Supabase Schema & Seed Data

**Implements:** FR-001, FR-005, FR-006, FR-013, FR-028
**Workflow:** `_planning/workflows/supabase-migration.md`
**Session type:** Backend (migration)
**Depends on:** Nothing

### Description
Create 3 new Supabase tables (`market_assets`, `market_prices`, `market_analyses`) per the schema in `architecture-markets-pulse.md`. The `market_assets` table includes both `epic` (Capital.com) and `yahoo_ticker` (Yahoo Finance) columns. Seed with all 28 instruments. Apply RLS policies.

### Acceptance Criteria

**AC1 — market_assets table exists and is seeded (FR-001)**
- Given the migration has been applied to Supabase
- When I query `SELECT count(*) FROM market_assets`
- Then the result is 28
- And each row has: id (uuid), symbol (unique text), epic (text nullable), yahoo_ticker (text nullable), name (text), category (one of: equities, currencies, commodities, bonds, crypto, volatility), data_source ("capital" or "external"), enabled (boolean default true), created_at (timestamptz)

**AC2 — Capital.com instruments have epics, external have yahoo_tickers (FR-002, FR-003)**
- Given the seed data has been inserted
- When I query `SELECT symbol, epic, yahoo_ticker, data_source FROM market_assets ORDER BY category`
- Then instruments available in Capital.com have `data_source = 'capital'` and a non-null `epic` column (e.g., EUR_USD → epic "EURUSD", XAU_USD → epic "GOLD")
- And instruments NOT in Capital.com have `data_source = 'external'` and a non-null `yahoo_ticker` column (e.g., DXY → yahoo_ticker "DX-Y.NYB", USB10Y_USD → yahoo_ticker "^TNX")

**AC3 — market_prices table exists with correct schema (FR-005, FR-006)**
- Given the migration has been applied
- When I inspect the `market_prices` table
- Then it has columns: id (uuid PK), asset_id (uuid FK → market_assets), price (numeric NOT NULL), change_24h_pct (numeric nullable), change_1w_pct (numeric nullable), change_1q_pct (numeric nullable), recorded_at (timestamptz NOT NULL)
- And there is an index on (asset_id, recorded_at DESC)
- And there is a unique index on (asset_id, DATE(recorded_at)) for upsert support (AD-MP-06)

**AC4 — market_analyses table exists with correct schema (FR-013, FR-015)**
- Given the migration has been applied
- When I inspect the `market_analyses` table
- Then it has columns: id (uuid PK), analysis_date (date UNIQUE NOT NULL), market_summary (text), key_movers (jsonb), geopolitical_watch (text), week_ahead (text), raw_data (jsonb), created_at (timestamptz)

**AC5 — RLS policies are applied (FR-028)**
- Given all 3 tables exist
- When I check RLS policies
- Then RLS is enabled on all 3 tables
- And anon role has SELECT-only access
- And service_role has full CRUD access

**AC6 — Migration file exists in the repo**
- Given the story is complete
- When I check the repo
- Then there is a SQL migration file at `supabase/migrations/` containing all DDL + seed data

**AC7 — TypeScript types are updated**
- Given the migration is applied
- When I check `packages/dashboard/src/lib/database.types.ts`
- Then it includes type definitions for market_assets, market_prices, and market_analyses tables

### Seed Data Reference

**Capital.com instruments (data_source = 'capital'):**
| symbol | epic | name | category |
|---|---|---|---|
| SPX500_USD | US500 | S&P 500 | equities |
| NAS100_USD | USTEC | NASDAQ 100 | equities |
| US30_USD | US30 | Dow Jones | equities |
| DE30_EUR | DE40 | DAX | equities |
| UK100_GBP | UK100 | FTSE 100 | equities |
| JP225_USD | JP225 | Nikkei 225 | equities |
| EUR_USD | EURUSD | EUR/USD | currencies |
| GBP_USD | GBPUSD | GBP/USD | currencies |
| USD_JPY | USDJPY | USD/JPY | currencies |
| USD_CHF | USDCHF | USD/CHF | currencies |
| XAU_USD | GOLD | Gold | commodities |
| XAG_USD | SILVER | Silver | commodities |
| BCO_USD | OIL_CRUDE | Brent Oil | commodities |
| WTICO_USD | OIL_CRUDE_WTI | WTI Oil | commodities |
| NATGAS_USD | NATURALGAS | Natural Gas | commodities |
| BTC_USD | BTCUSD | Bitcoin | crypto |
| ETH_USD | ETHUSD | Ethereum | crypto |
| VIX | VIX | VIX | volatility |

**NOTE:** Capital.com epics above are best guesses. During MP.3 implementation, Claude Code must verify each epic by querying `GET /api/v1/markets?searchTerm=...` and update the seed data if any epic is wrong.

**External instruments (data_source = 'external'):**
| symbol | yahoo_ticker | name | category |
|---|---|---|---|
| CN50_USD | 2823.HK | China A50 | equities |
| DXY | DX-Y.NYB | Dollar Index | currencies |
| HG_USD | HG=F | Copper | commodities |
| USB10Y_USD | ^TNX | US 10Y Yield | bonds |
| USB02Y_USD | 2YY=F | US 2Y Yield | bonds |
| DE10YB_EUR | DE10Y (verify) | German 10Y | bonds |

### Files Created/Modified
- `supabase/migrations/YYYYMMDDHHMMSS_market_pulse_tables.sql` (new)
- `packages/dashboard/src/lib/database.types.ts` (modify)

### Sub-Agent Validation
- `.claude/agents/supabase-architect.md`

### Claude Code Prompt
```
Read and execute the session protocol at _planning/prompts/session-template.md
Target: Epic Markets Pulse, Story MP.1 — Supabase Schema & Seed Data
Epic file: _planning/artifacts/epics/epic-06-markets-pulse.md
```

---

## Story MP.2 — Expand GDELT Geopolitical Queries

**Implements:** FR-007, FR-008, FR-009, FR-010
**Workflow:** `_planning/workflows/backend-feature.md`
**Session type:** Backend (agent)
**Depends on:** Nothing (can run in parallel with MP.1)

### Description
Add 4 new GDELT query strings to the agent's `fetchAllNews()` function in `packages/agent/src/index.js`. These target geopolitical topics and are tagged `category: 'geopolitical'` in `news_cache`. The existing 3 market GDELT queries and all Finnhub/MarketAux fetches must remain untouched.

### Acceptance Criteria

**AC1 — New GDELT queries execute during news fetch (FR-007)**
- Given the agent starts a news fetch cycle via `fetchAllNews()`
- When the function completes
- Then it has executed the existing 3 GDELT market queries
- And it has also executed these 4 new queries:
  - `"sanctions" OR "trade war" OR "tariff"`
  - `"military" OR "conflict" OR "war" OR "invasion"`
  - `"election" OR "regime change" OR "coup"`
  - `"OPEC" OR "energy crisis" OR "pipeline"`

**AC2 — Geopolitical articles are tagged correctly (FR-008)**
- Given a GDELT geopolitical query returns articles
- When they are pushed into the `allArticles` array
- Then each article has `category: 'geopolitical'`
- And `data_source: 'gdelt'`
- And the existing 3 market queries still use `category: 'market'`

**AC3 — Existing data sources are untouched (FR-009)**
- Given the agent runs a full news cycle
- When `fetchAllNews()` completes
- Then the Finnhub general + forex fetches are unchanged
- And the MarketAux fetch is unchanged
- And the 3 original GDELT market queries are unchanged

**AC4 — Deduplication covers new queries (FR-010)**
- Given geopolitical and market GDELT queries may return overlapping articles
- When `deduplicateNews()` runs on the combined results
- Then duplicate titles are removed across all sources

**AC5 — Error handling matches existing pattern**
- Given a geopolitical GDELT query fails
- When the error occurs
- Then it is logged via `logger.error` with context
- And the remaining queries still execute (no early abort)

### Files Created/Modified
- `packages/agent/src/index.js` (modify `fetchAllNews()`)

### Sub-Agent Validation
- None required (simple addition following existing pattern)

### Claude Code Prompt
```
Read and execute the session protocol at _planning/prompts/session-template.md
Target: Epic Markets Pulse, Story MP.2 — Expand GDELT Geopolitical Queries
Epic file: _planning/artifacts/epics/epic-06-markets-pulse.md
```

---

## Story MP.3 — API Route `/api/markets/refresh`

**Implements:** FR-002, FR-003, FR-004, FR-005, FR-011, FR-012, FR-013, FR-014, FR-015, FR-017, FR-018, FR-029, FR-030
**Workflow:** `_planning/workflows/backend-feature.md`
**Session type:** Backend (Vercel serverless function)
**Depends on:** MP.1 (tables must exist)

### Description
Create a Next.js API route at `/api/markets/refresh` that orchestrates the daily refresh: authenticate with Capital.com, fetch prices, fetch Yahoo Finance prices for external instruments, calculate changes, call OpenRouter for AI analysis, store everything in Supabase. This is the heaviest story.

### Acceptance Criteria

**AC1 — Capital.com session authentication works (FR-002)**
- Given CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD, and CAPITAL_BASE_URL are set in Vercel env vars
- When the refresh route starts
- Then it calls `POST /api/v1/session` with the `X-CAP-API-KEY` header and `{identifier, password}` body
- And it receives CST and X-SECURITY-TOKEN headers
- And these tokens are used for all subsequent Capital.com calls in this refresh

**AC2 — Capital.com prices are fetched (FR-002)**
- Given `market_assets` contains instruments with `data_source = 'capital'`
- When the refresh route fetches prices
- Then it calls `GET /api/v1/markets?epics=EURUSD,GOLD,...` using the session tokens
- And it extracts the current bid/ask midpoint price for each instrument

**AC3 — Capital.com epics are verified (AD-MP-04 implementation note)**
- Given the seed data contains estimated epics
- When the first refresh runs and an epic returns no data
- Then the error is logged with the instrument name and attempted epic
- And the instrument is skipped (not a fatal error)

**AC4 — External prices are fetched via Yahoo Finance (FR-003)**
- Given `market_assets` contains instruments with `data_source = 'external'`
- When the refresh route fetches prices
- Then it uses `yahoo-finance2` with the `yahoo_ticker` from each asset row
- And extracts the current price

**AC5 — Change percentages are calculated correctly (FR-004)**
- Given `market_prices` contains historical data for an instrument
- When a new price is fetched
- Then change_24h_pct = ((current - price_1d_ago) / price_1d_ago) * 100
- And change_1w_pct = ((current - price_7d_ago) / price_7d_ago) * 100
- And change_1q_pct = ((current - price_90d_ago) / price_90d_ago) * 100
- And historical prices are found by querying the closest recorded_at to each target date

**AC6 — Null changes for missing history (FR-006)**
- Given an instrument has no historical price for a timeframe
- When changes are calculated
- Then that change is null (not 0, not an error)

**AC7 — Prices are stored via upsert (FR-005, FR-017)**
- Given prices have been fetched
- When stored in `market_prices`
- Then an upsert is performed on (asset_id, DATE(recorded_at))
- And calling the route twice on the same day updates, not duplicates

**AC8 — AI analysis is generated with correct structure (FR-011, FR-012)**
- Given prices, recent news, geopolitical news, and upcoming events are available
- When sent to OpenRouter (DeepSeek model — AD-MP-07)
- Then the AI returns JSON with: `market_summary` (string), `key_movers` (array of up to 5: {instrument, change, explanation}), `geopolitical_watch` (string), `week_ahead` (string)

**AC9 — AI analysis is stored via upsert (FR-013, FR-015, FR-017)**
- Given the AI analysis is generated
- When stored in `market_analyses`
- Then upsert on `analysis_date`
- And `raw_data` contains the full raw AI response

**AC10 — Partial success on AI failure (FR-014)**
- Given the OpenRouter call fails
- When the error occurs
- Then already-fetched prices are still stored
- And the route returns 200 with `{ success: true, analysis: false, error: "AI analysis failed: [reason]" }`

**AC11 — Error response on complete failure (FR-018)**
- Given a critical failure (e.g., Supabase unreachable)
- When the route cannot complete any work
- Then it returns 500 with `{ error: "description" }`

**AC12 — Environment variables documented (FR-029)**
- Given the story is complete
- When I check `packages/dashboard/.env.example`
- Then it includes: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD, CAPITAL_BASE_URL

**AC13 — yahoo-finance2 is installed**
- Given the story is complete
- When I check `packages/dashboard/package.json`
- Then `yahoo-finance2` is listed as a dependency

### Files Created/Modified
- `packages/dashboard/src/app/api/markets/refresh/route.ts` (new)
- `packages/dashboard/src/lib/capital.ts` (new — lightweight Capital.com price fetcher with session auth + epic mapping)
- `packages/dashboard/src/lib/yahoo.ts` (new — Yahoo Finance wrapper)
- `packages/dashboard/.env.example` (modify)
- `packages/dashboard/package.json` (modify — add yahoo-finance2)

### Sub-Agent Validation
- `.claude/agents/api-architect.md`
- `.claude/agents/supabase-architect.md`

### Claude Code Prompt
```
Read and execute the session protocol at _planning/prompts/session-template.md
Target: Epic Markets Pulse, Story MP.3 — API Route /api/markets/refresh
Epic file: _planning/artifacts/epics/epic-06-markets-pulse.md

Additional context:
- Architecture decisions: _planning/artifacts/architecture-markets-pulse.md
- AD-MP-02: Capital.com for tradable instruments, Yahoo Finance for rest
- AD-MP-03: Fresh session auth per refresh call
- AD-MP-04: Internal names stay EUR_USD format, translate to EURUSD at API boundary
- Capital.com API docs: https://open-api.capital.com/
- Capital.com auth: POST /api/v1/session with X-CAP-API-KEY header + {identifier, password} body → CST + X-SECURITY-TOKEN in response headers
- Capital.com prices: GET /api/v1/markets?epics=EURUSD,GOLD,...
- IMPORTANT: Verify each epic by calling GET /api/v1/markets?searchTerm=gold (etc.) during implementation. Update market_assets.epic if any differ from seed data.
- Reference the agent's Capital.com data layer if it exists: packages/agent/src/data/capital.js
- OpenRouter pattern: see packages/agent/src/intelligence/llm-router.js for reference
```

---

## Story MP.4 — Dashboard `/markets` Page

**Implements:** FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027
**Workflow:** `_planning/workflows/frontend-feature.md`
**Session type:** Frontend (dashboard)
**Depends on:** MP.1 (tables must exist)

### Description
Create the `/markets` page in the dashboard with 4 sections: Asset Grid, AI Morning Briefing, Geopolitical Watch, and Economic Calendar. Uses existing component patterns and the dark zinc theme.

### Acceptance Criteria

**AC1 — Page exists at /markets route (FR-020)**
- Given the dashboard is running
- When I navigate to `/markets`
- Then the page renders without errors
- And the page title is "Global Markets"

**AC2 — Sidebar includes /markets link (FR-020)**
- Given the sidebar component renders
- When I look at the navigation links
- Then there is a "Markets" link pointing to `/markets` with an appropriate icon

**AC3 — Asset Grid displays grouped instruments (FR-021, FR-022)**
- Given `market_prices` has data for today
- When the Asset Grid component renders
- Then instruments are grouped under category headers: Equities, Currencies, Commodities, Bonds, Crypto, Volatility
- And each row shows: name, current price (formatted), 24h %, 1W %, 1Q %
- And positive percentages display in emerald/green text
- And negative percentages display in red text
- And null percentages display as "—"

**AC4 — Morning Briefing card displays AI analysis (FR-023)**
- Given `market_analyses` has a row for today
- When the Morning Briefing component renders
- Then it shows the analysis date, market_summary, key_movers (instrument + change + explanation), geopolitical_watch, and week_ahead sections

**AC5 — Geopolitical Watch displays headlines (FR-024)**
- Given `news_cache` contains articles with `category = 'geopolitical'`
- When the Geopolitical Watch component renders
- Then it shows up to 10 most recent geopolitical headlines with title (clickable), source, time ago

**AC6 — Economic Calendar displays upcoming events (FR-025)**
- Given `economic_calendar` contains upcoming events
- When the Economic Calendar component renders
- Then it shows high-impact events for the next 7 days with name, currency, date/time, impact level (color-coded)

**AC7 — Empty states are user-friendly (FR-026)**
- Given no data exists yet
- When the page loads
- Then each section shows a friendly message and a "Refresh Data" button is visible

**AC8 — Visual consistency with existing dashboard (FR-027)**
- Given the existing dark zinc theme
- When the /markets page renders
- Then all cards use `bg-zinc-900 rounded-xl border border-zinc-800 p-5`

**AC9 — Manual refresh button exists (FR-019)**
- Given the user is on /markets
- When they click "Refresh Data"
- Then it calls `/api/markets/refresh`, shows loading state, and refreshes data on completion

### Files Created/Modified
- `packages/dashboard/src/app/markets/page.tsx` (new)
- `packages/dashboard/src/components/markets/AssetGrid.tsx` (new)
- `packages/dashboard/src/components/markets/MorningBriefing.tsx` (new)
- `packages/dashboard/src/components/markets/GeopoliticalWatch.tsx` (new)
- `packages/dashboard/src/components/markets/MarketCalendar.tsx` (new)
- `packages/dashboard/src/components/layout/Sidebar.tsx` (modify — add Markets link)

### Sub-Agent Validation
- `.claude/agents/frontend-architect.md`

### Claude Code Prompt
```
Read and execute the session protocol at _planning/prompts/session-template.md
Target: Epic Markets Pulse, Story MP.4 — Dashboard /markets Page
Epic file: _planning/artifacts/epics/epic-06-markets-pulse.md

Additional context:
- Follow existing patterns: PortfolioCard.tsx, NewsFeed.tsx, EventTimeline.tsx
- Use existing Supabase client from @/lib/supabase
- AD-MP-09: read Supabase directly, no API route for display
- Theme: bg-zinc-900 cards, border-zinc-800, text-zinc-100/400, emerald-400/red-400
```

---

## Story MP.5 — Vercel Cron, End-to-End Test & Polish

**Implements:** FR-016, FR-017, FR-019
**Workflow:** None (integration + testing)
**Session type:** Backend (configuration + testing)
**Depends on:** MP.3 (route exists), MP.4 (page exists)

### Description
Add the Vercel cron config, test the full pipeline, fix issues. Verify Capital.com epics are correct. Ensure manual refresh works.

### Acceptance Criteria

**AC1 — Cron is configured in vercel.json (FR-016)**
- Given `vercel.json` exists
- When I inspect it
- Then it has a cron entry: path `/api/markets/refresh`, schedule `0 7 * * *`

**AC2 — Route completes within Vercel timeout**
- Given the refresh route is deployed
- When triggered
- Then it completes successfully within the serverless timeout
- And if timeout is too short, this is documented in memory/dependencies.md

**AC3 — Full pipeline runs end-to-end**
- Given the agent is running (news_cache and economic_calendar populated)
- When I trigger `/api/markets/refresh`
- Then `market_prices` has 28 rows for today (or fewer if some epics failed — logged)
- And `market_analyses` has 1 row for today with all 4 sections
- And `/markets` page displays all data correctly

**AC4 — Capital.com epics are verified**
- Given the refresh has run
- When I check the logs
- Then any instruments that returned "epic not found" are documented
- And the correct epics are updated in `market_assets` via a follow-up SQL update

**AC5 — Manual refresh button works (FR-019)**
- Given I'm on /markets
- When I click Refresh
- Then loading state shows, route runs, data updates on completion

**AC6 — Second refresh upserts correctly (FR-017)**
- Given refresh already ran today
- When triggered again
- Then market_prices has exactly 28 rows (updated, not 56)
- And market_analyses has exactly 1 row (updated, not 2)

### Files Created/Modified
- `vercel.json` (modify — add crons)
- Any fixes discovered during E2E testing

### Sub-Agent Validation
- `.claude/agents/api-architect.md`

### Claude Code Prompt
```
Read and execute the session protocol at _planning/prompts/session-template.md
Target: Epic Markets Pulse, Story MP.5 — Vercel Cron, End-to-End Test & Polish
Epic file: _planning/artifacts/epics/epic-06-markets-pulse.md

Additional context:
- Verify CAPITAL_* env vars are set in Vercel dashboard
- Check Vercel plan timeout limits
- Run manual refresh and check all 3 tables + /markets page
- Document any Capital.com epic mismatches in memory/dependencies.md
```

---

## Execution Order

| Order | Story | Session Type | Depends On | Workflow | Sub-Agents |
|-------|-------|-------------|------------|----------|------------|
| 1 | MP.1 — Supabase Schema & Seed | Backend (migration) | — | supabase-migration | supabase-architect |
| 2 | MP.2 — GDELT Geopolitical Queries | Backend (agent) | — | backend-feature | — |
| 3 | MP.3 — API Route /api/markets/refresh | Backend (Vercel fn) | MP.1 | backend-feature | api-architect, supabase-architect |
| 4 | MP.4 — Dashboard /markets Page | Frontend | MP.1 | frontend-feature | frontend-architect |
| 5 | MP.5 — Cron & E2E Testing | Integration | MP.3, MP.4 | — | api-architect |

**Notes:**
- MP.1 and MP.2 have no dependency on each other — can be done in either order
- MP.3 and MP.4 MUST be separate sessions (CLAUDE.md: "ALWAYS separate backend and frontend")
- MP.3 creates `capital.ts` in the dashboard — a lightweight read-only Capital.com client separate from the agent's `capital.js` trading client. It only needs price fetching + session auth, not order execution.

## CLAUDE.md / Memory Updates After This Epic

### memory/progress.md
```
- Markets Pulse epic: ✅
- /markets page live with daily cron at 07:00 UTC
```

### memory/decisions.md
```
## AD-MP-01 through AD-MP-09
[All decisions from architecture-markets-pulse.md]
```

### memory/dependencies.md
```
## Capital.com (Dashboard — read-only price fetching)
- Auth: POST /api/v1/session with X-CAP-API-KEY + {identifier, password}
- Returns CST + X-SECURITY-TOKEN headers (use for all subsequent calls)
- Session expires after 10min inactivity — re-auth each daily refresh
- Rate limit: 10 req/sec (we use ~3-5 calls per refresh)
- Epics verified: [list correct epics after MP.5]

## yahoo-finance2
- No API key needed
- Symbol mapping: DXY → DX-Y.NYB, ^TNX → US 10Y, etc.
- Occasionally rate-limits — handle gracefully

## Vercel Cron
- Hobby plan: 10s timeout — likely too short for full refresh
- Pro plan: 60s timeout — should work
- Cron schedule: 0 7 * * * (daily 7:00 UTC)
```
