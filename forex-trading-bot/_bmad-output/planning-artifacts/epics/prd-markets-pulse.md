# PRD — Global Markets Pulse

## Problem Statement
The Fajrrr Trading dashboard currently monitors the bot's own portfolio and trades. There is no consolidated view of global market conditions — the user must check multiple external sources to understand what's moving, why, and what's coming. This slows down decision-making and creates blind spots.

## Solution
A new `/markets` page inside the existing Fajrrr Trading dashboard that provides a daily "morning briefing" view of global markets. It tracks 28 instruments across 6 asset classes, generates an AI-powered daily analysis via OpenRouter, surfaces geopolitical risks from GDELT, and shows upcoming high-impact economic events from the existing Finnhub calendar.

## Users
- Primary: The Fajrrr Trading bot operator (single user)
- Use case: Open the dashboard in the morning, read the briefing, understand the global picture before the trading day

## Success Metrics
- SM-1: All 28 instruments display current prices with 24h/1W/1Q changes daily by 07:30 UTC
- SM-2: AI briefing is generated and stored daily without manual intervention
- SM-3: Geopolitical headlines surface relevant global risks within the last 24h
- SM-4: Page loads in under 3 seconds with all sections populated

## Functional Requirements

### Data Collection
- **FR-001**: The system shall maintain a registry of 28 instruments across 6 categories (equities, currencies, commodities, bonds, crypto, volatility) in a `market_assets` table
- **FR-002**: The system shall fetch daily prices for all Capital.com-available instruments via the Capital.com REST API (`GET /api/v1/markets?epics=...`), authenticating with a session token (CST + X-SECURITY-TOKEN)
- **FR-003**: The system shall fetch daily prices for non-Capital.com instruments (DXY, bonds, Copper, China A50) via Yahoo Finance (`yahoo-finance2` npm package, no API key required)
- **FR-004**: The system shall calculate percentage changes at 3 timeframes: 24 hours, 1 week (7 days), 1 quarter (90 days) — using historical data from `market_prices`
- **FR-005**: The system shall store daily price snapshots in a `market_prices` table with asset reference, price, and the 3 change percentages
- **FR-006**: If no historical price exists for a given timeframe (e.g., first week of data), the change percentage shall be null

### Geopolitical News
- **FR-007**: The agent's `fetchAllNews()` function shall execute 4 additional GDELT queries targeting geopolitical topics: sanctions/trade wars, military conflicts, elections/regime changes, energy/OPEC
- **FR-008**: Geopolitical articles shall be stored in the existing `news_cache` table with `category: 'geopolitical'` to distinguish them from market news
- **FR-009**: Existing GDELT market queries, Finnhub news, and MarketAux fetches shall remain unchanged
- **FR-010**: Deduplication via `deduplicateNews()` shall apply across all sources including new geopolitical queries

### AI Analysis
- **FR-011**: The system shall generate a daily AI analysis via OpenRouter using price data, recent news (from `news_cache`), and upcoming economic events (from `economic_calendar`)
- **FR-012**: The AI analysis shall produce 4 sections: market summary (text), key movers (top 5 instruments with explanations), geopolitical watch (active risks and market implications), week ahead (upcoming events that matter)
- **FR-013**: The AI analysis shall be stored in a `market_analyses` table with one row per day, keyed by `analysis_date`
- **FR-014**: If the AI call fails, the price data shall still be saved (partial success is acceptable)
- **FR-015**: The raw AI response shall be stored in a `raw_data` jsonb column for debugging

### Daily Refresh
- **FR-016**: A Vercel cron job shall trigger the full refresh (prices + AI analysis) once daily at 07:00 UTC
- **FR-017**: The refresh shall be idempotent — calling it twice on the same day upserts rather than duplicates
- **FR-018**: The refresh API route shall return appropriate error responses (500 with description) on failure
- **FR-019**: A manual "Refresh Data" button on the `/markets` page shall trigger the same refresh route

### Dashboard UI
- **FR-020**: A new `/markets` page shall be accessible from the sidebar navigation
- **FR-021**: The page shall display an Asset Grid showing all 28 instruments grouped by category, with columns: name, price, 24h change %, 1W change %, 1Q change %
- **FR-022**: Positive changes shall display in green, negative in red, null as a dash (—)
- **FR-023**: The page shall display an AI Morning Briefing card with the 4 analysis sections and the analysis date
- **FR-024**: The page shall display a Geopolitical Watch card with the 10 most recent geopolitical headlines (title, source, time ago)
- **FR-025**: The page shall display an Economic Calendar card with upcoming high-impact events for the next 7 days (name, currency, date/time, impact level color-coded)
- **FR-026**: If no data exists yet (before first cron run), each section shall show a friendly empty state, not an error
- **FR-027**: The page shall match the existing dashboard's dark zinc theme (zinc-900 cards, zinc-800 borders, emerald/red for positive/negative)

### Security & Data
- **FR-028**: All new Supabase tables shall have RLS policies: SELECT-only for anon, full access for service_role
- **FR-029**: No new API keys shall be hardcoded — any new environment variables must be added to `.env.example`
- **FR-030**: The refresh route shall not require authentication (it's triggered by Vercel cron which doesn't send auth headers), but shall be rate-limited by Vercel's cron mechanism

## Priority
- P0 (must have): FR-001 through FR-006 (prices), FR-011 through FR-015 (AI analysis), FR-016 through FR-018 (cron), FR-020 through FR-023 (core UI), FR-028
- P1 (should have): FR-007 through FR-010 (geopolitical GDELT), FR-024 through FR-027 (full UI), FR-019 (manual refresh), FR-029 through FR-030
- P2 (nice to have): None — scope is intentionally tight

## Out of Scope
- Real-time streaming prices (this is a daily snapshot tool, not a live ticker)
- Trading signals or recommendations from the markets page (that's the bot's job)
- Historical charts or trend visualizations (possible future epic)
- Multi-user access or role-based permissions
