# Architecture — Global Markets Pulse

## Overview
New feature within the existing Fajrrr Trading monorepo. Adds a `/markets` page to the dashboard and a daily cron-triggered refresh pipeline.

## Data Flow

```
07:00 UTC — Vercel Cron
    │
    └─→ GET /api/markets/refresh (Vercel serverless function)
            │
            ├─ 1. Read enabled assets from market_assets (Supabase)
            │
            ├─ 2. Authenticate with Capital.com
            │     └─ POST /api/v1/session with X-CAP-API-KEY header
            │     └─ Get CST + X-SECURITY-TOKEN for subsequent calls
            │
            ├─ 3. Fetch Capital.com prices
            │     └─ GET /api/v1/markets?epics=EURUSD,GOLD,US30,...
            │     └─ For instruments with data_source = "capital"
            │     └─ Translate internal names (EUR_USD) to epics (EURUSD) at API boundary
            │
            ├─ 4. Fetch external prices (yahoo-finance2 npm)
            │     └─ For instruments with data_source = "external"
            │     └─ DXY, USB10Y, USB02Y, DE10YB, HG, CN50
            │
            ├─ 5. Calculate change %s (query market_prices for historical)
            │     └─ 24h: compare to yesterday's price
            │     └─ 1W: compare to 7 days ago
            │     └─ 1Q: compare to 90 days ago
            │
            ├─ 6. Store prices → market_prices (Supabase upsert)
            │
            ├─ 7. Read context data (Supabase)
            │     ├─ Recent news from news_cache (last 24h, all categories)
            │     ├─ Recent geopolitical news from news_cache (category = 'geopolitical')
            │     └─ Upcoming events from economic_calendar (next 7 days, high impact)
            │
            ├─ 8. Call OpenRouter → AI analysis
            │     ├─ Input: prices + changes + news + events
            │     ├─ Model: DeepSeek or Gemini Flash (cost-efficient for daily summaries)
            │     └─ Output: JSON with 4 sections
            │
            └─ 9. Store analysis → market_analyses (Supabase upsert by date)


Agent (Render) — runs independently
    │
    └─ fetchAllNews() now includes 4 extra GDELT geopolitical queries
       └─ Stored in news_cache with category: 'geopolitical'
       └─ Available for the dashboard refresh to read


Dashboard /markets page
    │
    ├─ Reads market_prices (latest per asset) → Asset Grid
    ├─ Reads market_analyses (today's row) → Morning Briefing
    ├─ Reads news_cache (category = 'geopolitical', last 24h) → Geopolitical Watch
    └─ Reads economic_calendar (next 7 days, high impact) → Economic Calendar
```

## Architecture Decisions

### AD-MP-01: Refresh runs in Vercel, not in the Render agent
**Decision:** The `/api/markets/refresh` route lives in packages/dashboard/ as a Next.js API route, not in the agent.
**Reasoning:** The agent's job is trading. The markets pulse is a dashboard feature — it reads data and generates analysis for display. Keeping it in the dashboard package avoids coupling the two concerns. The agent only contributes by expanding its GDELT queries.
**Trade-off:** The Vercel function needs access to Capital.com credentials. These must be added to Vercel env vars.

### AD-MP-02: Capital.com for tradable instruments, Yahoo Finance for the rest
**Decision:** Use Capital.com REST API for instruments the bot can trade. Use `yahoo-finance2` for instruments Capital.com doesn't cover (DXY, bond yields, Copper, China A50).
**Reasoning:** Capital.com provides real-time bid/ask prices for forex, commodities, crypto, indices, and VIX. Using the same broker API ensures price consistency with the trading bot. Yahoo Finance fills the gaps — free, no API key.

### AD-MP-03: Capital.com session auth with fresh session per refresh
**Decision:** Each daily refresh call authenticates with Capital.com (`POST /api/v1/session`) at the start, uses the CST + X-SECURITY-TOKEN for all price calls, then lets the session expire naturally.
**Reasoning:** Capital.com sessions expire after 10 minutes of inactivity. Since the refresh runs once daily, there's no point maintaining a persistent session. Authenticate fresh each time — simple and reliable.

### AD-MP-04: Internal instrument names stay OANDA-style, translate at API boundary
**Decision:** The `market_assets` table and all internal code use the existing underscore format (EUR_USD, XAU_USD, etc.). Translation to Capital.com epics (EURUSD, GOLD) happens only in the Capital.com API call layer.
**Reasoning:** The entire codebase (screener, analyst, researcher, dashboard) already uses the underscore format. Changing it everywhere would be a massive refactor for no benefit. The agent already implements this pattern via `toEpic()` / `fromEpic()` functions in the Capital.com data layer.

### AD-MP-05: One Supabase table per concern
**Decision:** 3 new tables: `market_assets` (registry), `market_prices` (daily snapshots), `market_analyses` (AI briefings).
**Reasoning:** Clean separation. `market_assets` is seeded once and rarely changes. `market_prices` grows by ~28 rows/day (~10K rows/year — trivial). `market_analyses` grows by 1 row/day.

### AD-MP-06: Idempotent upserts, not inserts
**Decision:** The refresh route upserts on (asset_id + DATE(recorded_at)) for prices and on (analysis_date) for analyses.
**Reasoning:** The cron might fire twice, or the user might click manual refresh after cron ran. Upserts prevent duplicates without "did we already run today?" checks.

### AD-MP-07: AI model selection for daily analysis
**Decision:** Use DeepSeek (via OpenRouter) for the daily briefing. Fall back to Gemini Flash if DeepSeek is unavailable.
**Reasoning:** The daily briefing is a structured summarization task, not complex reasoning. DeepSeek provides high quality at low cost. The agent already uses OpenRouter's multi-model routing — we follow the same pattern.

### AD-MP-08: Dashboard reads existing agent data, does not duplicate fetching
**Decision:** The `/markets` page reads `news_cache` and `economic_calendar` tables that the agent already populates. It does NOT fetch news or calendar data itself.
**Reasoning:** The agent already runs on Render and fetches news from Finnhub, GDELT, and MarketAux on every trading cycle. The dashboard just reads what's already there. No duplication, no extra API calls.
**Dependency:** The agent must be running for news and calendar data to be fresh. If the agent is down, the briefing will use stale data — acceptable for a daily snapshot tool.

### AD-MP-09: Frontend reads directly from Supabase, no API route for display
**Decision:** The `/markets` page components query Supabase directly using the existing `supabase` client (same pattern as PortfolioCard, NewsFeed, EventTimeline).
**Reasoning:** Consistent with the existing dashboard architecture. Every other component reads from Supabase directly.

## Capital.com Instrument Mapping

The `market_assets` table stores the internal name AND the Capital.com epic:

| Internal Name | Capital.com Epic | Category |
|---|---|---|
| EUR_USD | EURUSD | currencies |
| GBP_USD | GBPUSD | currencies |
| USD_JPY | USDJPY | currencies |
| USD_CHF | USDCHF | currencies |
| XAU_USD | GOLD | commodities |
| XAG_USD | SILVER | commodities |
| BCO_USD | OIL_CRUDE | commodities |
| WTICO_USD | OIL_CRUDE (WTI — verify epic) | commodities |
| NATGAS_USD | NATURALGAS | commodities |
| SPX500_USD | US500 | equities |
| NAS100_USD | USTEC | equities |
| US30_USD | US30 | equities |
| DE30_EUR | DE40 | equities |
| UK100_GBP | UK100 | equities |
| JP225_USD | JP225 | equities |
| BTC_USD | BTCUSD | crypto |
| ETH_USD | ETHUSD | crypto |
| VIX | VIX (verify availability) | volatility |

**Note:** The exact Capital.com epics must be verified during implementation by querying `GET /api/v1/markets?searchTerm=...`. Some epics may differ from the above — the session prompt for MP.3 includes a verification step.

**External (Yahoo Finance):**
| Internal Name | Yahoo Ticker | Category |
|---|---|---|
| DXY | DX-Y.NYB | currencies |
| CN50_USD | 2823.HK or similar | equities |
| HG_USD | HG=F | commodities |
| USB10Y_USD | ^TNX | bonds |
| USB02Y_USD | ^IRX or 2YY=F | bonds |
| DE10YB_EUR | DE10Y (verify) | bonds |

## Supabase Schema

### market_assets
```sql
CREATE TABLE market_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,          -- Internal name: EUR_USD, XAU_USD, etc.
  epic TEXT,                             -- Capital.com epic: EURUSD, GOLD, etc. (null for external)
  yahoo_ticker TEXT,                     -- Yahoo Finance ticker (null for Capital.com instruments)
  name TEXT NOT NULL,                    -- Display name: "EUR/USD", "Gold", etc.
  category TEXT NOT NULL CHECK (category IN ('equities','currencies','commodities','bonds','crypto','volatility')),
  data_source TEXT NOT NULL CHECK (data_source IN ('capital','external')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### market_prices
```sql
CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES market_assets(id),
  price NUMERIC NOT NULL,
  change_24h_pct NUMERIC,
  change_1w_pct NUMERIC,
  change_1q_pct NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_prices_asset_date ON market_prices (asset_id, recorded_at DESC);
CREATE UNIQUE INDEX idx_market_prices_asset_day ON market_prices (asset_id, DATE(recorded_at));
```

### market_analyses
```sql
CREATE TABLE market_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_date DATE UNIQUE NOT NULL,
  market_summary TEXT,
  key_movers JSONB,
  geopolitical_watch TEXT,
  week_ahead TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Environment Variables (new for Vercel)

| Variable | Where | Purpose |
|----------|-------|---------|
| CAPITAL_API_KEY | Vercel (dashboard) | Capital.com API authentication. Already exists in Render (agent). Must be added to Vercel. |
| CAPITAL_IDENTIFIER | Vercel (dashboard) | Capital.com login email |
| CAPITAL_PASSWORD | Vercel (dashboard) | Capital.com API custom password |
| CAPITAL_BASE_URL | Vercel (dashboard) | `https://demo-api-capital.backend-capital.com` for demo, `https://api-capital.backend-capital.com` for live |

No new API keys beyond Capital.com creds — yahoo-finance2 requires none, OpenRouter and Supabase keys already exist in Vercel.

## Vercel Cron

```json
{
  "crons": [
    {
      "path": "/api/markets/refresh",
      "schedule": "0 7 * * *"
    }
  ]
}
```

## Capital.com Rate Limits
- 10 requests/second general
- 1 position request per 0.1s (not relevant — we only read prices)
- 1000 position requests/hour on demo (not relevant)
- Session timeout: 10 minutes of inactivity
- The refresh route makes ~3-5 API calls total (1 session auth + 1-2 market price batches) — well within limits

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Capital.com session auth fails | Low | High | Catch error, fall back to Yahoo Finance for all instruments. Log alert. |
| Capital.com epic names differ from expected | Medium | Medium | MP.3 includes a verification step: query `/api/v1/markets?searchTerm=` for each instrument during implementation. Store verified epics in `market_assets.epic`. |
| Yahoo Finance rate limiting | Medium | Medium | Catch errors, store partial data, log warning. |
| Vercel serverless timeout (60s Pro, 10s Hobby) | Medium | High | Process Capital.com and Yahoo prices in parallel. Keep AI prompt concise. May need Pro plan. |
| AI generating poor quality analysis | Low | Medium | Store raw_data for debugging. Iterate on prompt. Can switch models via OpenRouter. |
| Stale news/calendar if agent is down | Medium | Low | Acceptable for daily snapshot. Add "data freshness" indicator to UI. |
