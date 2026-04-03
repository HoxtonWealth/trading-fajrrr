# Project: Autonomous Forex Trading Bot

## Architecture
- **Stack:** Next.js (Vercel cron + API routes), Supabase (Postgres), OpenRouter (LLM), Capital.com REST API (broker), Finnhub (news), GDELT (geopolitical), Polymarket + Kalshi (prediction markets), Telegram (alerts)
- **2 repos:** `forex-trading-bot` (Vercel) + `forex-bot-monitor` (Render — not yet active, for live trading)
- **This repo:** `forex-trading-bot` — all cron jobs, agent pipeline, risk gate, learning loops, intelligence layer, dashboard
- **Blueprint:** `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md`
- **Dashboard:** `/dashboard` — status page with kill switch toggle, Bot Activity log
- **Production:** https://forex-trading-bot-six.vercel.app

## Status: ALL EPICS + SALVAGE FEATURES COMPLETE — PAPER TRADING LIVE
- All 5 epics (45 stories) built and deployed
- 6 salvage features from fajrrr-trading ported (2026-04-02): Kill Switch, Trade Post-Mortem, GDELT Sentiment, Instrument Discovery, Market Screener, Scan Scheduler
- Bot is live on Capital.com demo account (AED 4,000)
- Trading dynamic instruments from `instrument_universe` table (12 active: XAU_USD, EUR_GBP, EUR_USD, USD_JPY, BCO_USD, US30_USD, AUD_USD, GBP_USD, NZD_USD, XAG_USD, US500_USD, GER40_EUR)
- Render monitor (`forex-bot-monitor/`) built but not deployed — activate for live trading

## Current Tuning (data-driven relaxation — 2026-04-03)
Thresholds adjusted based on funnel analysis (`_bmad-output/analysis/trade-frequency-report.md`):
- **Trend following ADX entry: 15** (was 20, was 25) — analysis showed 11 crossovers in 14 days but only 3 passed ADX>20. At 15, 7 pass (+133%). Also fixes dead code where TF ran in transition regime (ADX 15-20) but could never fire.
- **Trend following ADX exit: 10** (was 15, was 20) — maintains 5-point gap between entry/exit
- **Regime detector: UNCHANGED** — trending > 20, ranging < 15, transition 15-20
- **Mean reversion RSI: 45/55** (was 40/60, was 30/70) — adds +15% MR signals
- **Mean reversion BB tolerance: 0.5%** (was exact touch) — captures ~10 near-miss signals per 14 days
- **Mean reversion ADX: UNCHANGED at < 25**
- **Agent confidence threshold: UNCHANGED at 0.3**
- **Instruments: 12** (was 6) — added AUD_USD, GBP_USD, NZD_USD, XAG_USD, US500_USD, GER40_EUR
- Pipeline runs every 15 min (scan scheduler decides when to actually execute based on market session)
- All risk limits UNCHANGED (2% per trade, 6 max positions, stops, circuit breakers + drawdown + daily loss halts)

## 14 Cron Jobs
| Cron | Schedule | What it does |
|------|----------|-------------|
| `ingest-candles` | */15 min | Fetch H4 candles + indicators (scan scheduler throttled) |
| `ingest-equity` | */5 min | Track equity, drawdown, daily P&L |
| `run-pipeline` | */15 min | Screener → agent pipeline → risk gate → trade execution (scan scheduler throttled) |
| `ingest-news-sentiment` | */4 hr | Finnhub + GDELT news → LLM sentiment scoring per instrument |
| `ingest-calendar` | Hourly | Economic calendar (needs Finnhub premium) |
| `ingest-geopolitical` | */4 hr | GDELT geopolitical headlines → news_cache |
| `poll-prediction-markets` | */5 min | Kalshi probabilities |
| `generate-pm-signals` | */15 min | Momentum/divergence/threshold detection |
| `pm-scenario-analysis` | */6 hr | LLM macro narrative from PM signals |
| `update-scorecards` | Daily | Trade stats + Darwinian weights + post-mortem lesson extraction |
| `weekly-review` | Sunday 00:00 | Sharpe/IC analysis, strategy pauses |
| `discover-instruments` | Sunday 00:30 | OpenRouter market research → add/remove instruments |
| `monthly-report` | 1st of month | Full performance report via Telegram |
| `markets/refresh` | Daily 07:00 | Global markets page data update |

## Intelligence Layer (NEW — Salvage Features)
- **Kill Switch** (`/api/kill-switch`) — POST to halt all trading instantly, dashboard toggle button
- **Trade Post-Mortem** (`lib/learning/post-mortem.ts`) — LLM analyzes every closed trade for process/entry/exit quality, lessons fed into Chief Analyst
- **GDELT Sentiment** (`lib/services/gdelt.ts`) — per-instrument geopolitical sentiment scoring alongside Finnhub
- **Instrument Discovery** (`lib/intelligence/discovery.ts`) — weekly OpenRouter research recommends add/remove instruments (min 3, max 12)
- **Market Screener** (`lib/intelligence/screener.ts`) — 6-factor composite scoring (volatility, trend, news, calendar, edge, PM) ranks instruments before each pipeline run
- **Scan Scheduler** (`lib/intelligence/scan-scheduler.ts`) — adjusts cron frequency by market session (overlap=15min, london/NY=30min, asian=2hr, off-hours=4hr)

## Dynamic Instruments
- Instruments are read from `instrument_universe` table, NOT hardcoded
- `lib/instruments.ts` provides `getActiveInstruments()` and `getFriendlyNames()` with hardcoded fallback
- All cron routes (`run-pipeline`, `ingest-candles`, `ingest-news-sentiment`) use dynamic list
- Weekly `discover-instruments` cron manages the universe via LLM recommendations

## Self-Learning Loops (5)
1. **Scorecards** — every closed trade: win rate, Darwinian weights (0.3–2.5)
2. **Post-Mortem** — every closed trade: LLM-scored process/entry/exit quality, lessons stored in `trade_lessons`
3. **Reflection** — every 10 closed trades: LLM pattern analysis, injected into prompts
4. **Weekly review** — Sharpe ratio, IC, alpha decay, strategy pause recommendations
5. **Prompt evolution** — monthly: rewrite worst agent prompt, 5-day shadow test

## Multi-Agent Pipeline
Pipeline runs: Market Screener ranks instruments → 4 analysts (Technical, Sentiment, Macro, Regime) in parallel → Bull/Bear debate → Chief Analyst decision (with past trade lessons) → Risk gate (8 checks) → Execute on Capital.com. Falls back to technical-only if LLM fails. Kill switch check at pipeline entry.

## Memory — Read BEFORE every task, update AFTER every session
@import memory/progress.md
@import memory/decisions.md
@import memory/mistakes.md
@import memory/patterns.md
@import memory/dependencies.md

## Workflows
| Task type | Workflow file |
|-----------|--------------|
| New cron endpoint | `_bmad-output/workflows/create-cron-endpoint.md` |
| New indicator | `_bmad-output/workflows/create-indicator.md` |
| New Supabase table | `_bmad-output/workflows/create-supabase-table.md` |

## Absolute Rules
- NEVER modify `risk/constants.ts` — risk limits are immutable, hardcoded, never AI-adjustable
- NEVER skip pre-trade checks — all 8 gates must pass before any trade executes
- NEVER let LLM output override risk rules — AI decides WHAT, risk code decides IF and HOW MUCH
- NEVER put secrets in code — all API keys in `.env.local` (Vercel) or environment variables
- ALWAYS write tests for risk-critical code (position sizing, pre-trade checks, circuit breakers)
- ALWAYS use TypeScript strict mode
- ALWAYS handle API errors gracefully — the bot must survive any single API failure
- Kill switch is additive safety — does NOT replace existing risk gates
- Screener scores do NOT override risk checks — high-scoring instruments still go through all 8 gates

## Definition of Done
1. Code compiles with zero TypeScript errors
2. All existing tests still pass (137 tests across 19 files)
3. New risk-critical code has tests
4. Error handling covers API failures (Capital.com, OpenRouter, Supabase, GDELT)
5. No hardcoded secrets in code
6. Memory files updated

## Key Files
| File | Purpose |
|------|---------|
| `lib/services/capital.ts` | Capital.com API client (session auth, instrument translation) |
| `lib/pipeline.ts` | Main trading pipeline (kill switch → agents + technical fallback) |
| `lib/agent-pipeline.ts` | Multi-agent orchestration (4 analysts → debate → chief) |
| `lib/risk/constants.ts` | IMMUTABLE risk limits |
| `lib/risk/position-sizer.ts` | Half-Kelly + ATR + vol targeting + leverage cap |
| `lib/risk/pre-trade-checks.ts` | 8 pre-trade safety gates |
| `lib/strategies/trend-following.ts` | EMA crossover + ADX entry/exit |
| `lib/strategies/mean-reversion.ts` | Bollinger + RSI + ADX entry/exit |
| `lib/strategies/regime-detector.ts` | ADX-based regime classification |
| `lib/services/cron-logger.ts` | Plain-English activity logging |
| `lib/services/kill-switch.ts` | Kill switch service (toggle, Telegram alert) |
| `lib/services/gdelt.ts` | GDELT geopolitical data + per-instrument sentiment |
| `lib/intelligence/screener.ts` | 6-factor market screener (pure data, no LLM) |
| `lib/intelligence/discovery.ts` | Weekly instrument discovery via OpenRouter |
| `lib/intelligence/scan-scheduler.ts` | Session-aware cron frequency control |
| `lib/learning/post-mortem.ts` | Trade lesson extraction + retrieval |
| `lib/instruments.ts` | Dynamic instrument list from DB with fallback |
| `app/api/kill-switch/route.ts` | Kill switch GET/POST API |
| `app/dashboard/page.tsx` | Status dashboard with kill switch toggle |

## Database Tables (21 migrations)
| Migration | Table/Change |
|-----------|-------------|
| 001–018 | Original schema (candles, indicators, trades, equity, scorecards, news, system_state, predictions, reflections, events, PM tables, cron_logs, market_pulse) |
| 019 | `system_state` — kill_switch row |
| 020 | `trade_lessons` — post-mortem quality scores, tags, lessons |
| 021 | `instrument_universe` — dynamic instrument management with status tracking |
