# Project: Autonomous Forex Trading Bot

## Architecture
- **Stack:** Next.js (Vercel cron + API routes), Supabase (Postgres), OpenRouter (LLM), Capital.com REST API (broker), Finnhub (news), Polymarket + Kalshi (prediction markets), Telegram (alerts)
- **2 repos:** `forex-trading-bot` (Vercel) + `forex-bot-monitor` (Render — not yet active, for live trading)
- **This repo:** `forex-trading-bot` — all cron jobs, agent pipeline, risk gate, learning loops, dashboard
- **Blueprint:** `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md`
- **Dashboard:** `/dashboard` — read-only status page with Bot Activity log

## Status: ALL EPICS COMPLETE — PAPER TRADING LIVE
- All 5 epics (45 stories) built and deployed
- Bot is live on Capital.com demo account (AED 4,000)
- Trading 6 instruments: XAU_USD (Gold), EUR_GBP, EUR_USD, USD_JPY, BCO_USD (Oil), US30_USD (Dow Jones)
- Render monitor (`forex-bot-monitor/`) built but not deployed — activate for live trading

## Current Tuning (loosened for learning)
Entry thresholds lowered to generate more trades so the 4 self-learning loops can train:
- Trend following ADX entry: 20 (was 25), exit: 15 (was 20)
- Regime detector: trending > 20 (was 25), ranging < 15 (was 20)
- Mean reversion RSI: 40/60 (was 30/70), ADX < 25 (was 20)
- Agent confidence threshold: 0.3 (was 0.4)
- Pipeline runs every 1 hour (was 4 hours)
- All risk limits UNCHANGED (2% per trade, 6 max positions, stops, circuit breakers)

## 11 Cron Jobs
| Cron | Schedule | What it does |
|------|----------|-------------|
| `ingest-candles` | */15 min | Fetch H4 candles + indicators for 6 instruments |
| `ingest-equity` | */5 min | Track equity, drawdown, daily P&L |
| `run-pipeline` | Hourly | Full agent pipeline → risk gate → trade execution |
| `ingest-news-sentiment` | */4 hr | Finnhub news → LLM sentiment scoring |
| `ingest-calendar` | Hourly | Economic calendar (needs Finnhub premium) |
| `poll-prediction-markets` | */5 min | Kalshi probabilities |
| `generate-pm-signals` | */15 min | Momentum/divergence/threshold detection |
| `pm-scenario-analysis` | */6 hr | LLM macro narrative from PM signals |
| `update-scorecards` | Daily | Trade stats + Darwinian weight updates |
| `weekly-review` | Sunday | Sharpe/IC analysis, strategy pauses |
| `monthly-report` | 1st of month | Full performance report via Telegram |

## Self-Learning Loops (4)
1. **Scorecards** — every closed trade: win rate, Darwinian weights (0.3–2.5)
2. **Reflection** — every 10 closed trades: LLM pattern analysis, injected into prompts
3. **Weekly review** — Sharpe ratio, IC, alpha decay, strategy pause recommendations
4. **Prompt evolution** — monthly: rewrite worst agent prompt, 5-day shadow test

## Multi-Agent Pipeline
Pipeline runs: 4 analysts (Technical, Sentiment, Macro, Regime) in parallel → Bull/Bear debate → Chief Analyst decision → Risk gate (8 checks) → Execute on Capital.com. Falls back to technical-only if LLM fails.

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

## Definition of Done
1. Code compiles with zero TypeScript errors
2. All existing tests still pass (91 tests)
3. New risk-critical code has tests
4. Error handling covers API failures (Capital.com, OpenRouter, Supabase)
5. No hardcoded secrets in code
6. Memory files updated

## Key Files
| File | Purpose |
|------|---------|
| `lib/services/capital.ts` | Capital.com API client (session auth, instrument translation) |
| `lib/pipeline.ts` | Main trading pipeline (agents + technical fallback) |
| `lib/agent-pipeline.ts` | Multi-agent orchestration (4 analysts → debate → chief) |
| `lib/risk/constants.ts` | IMMUTABLE risk limits |
| `lib/risk/position-sizer.ts` | Half-Kelly + ATR + vol targeting + leverage cap |
| `lib/risk/pre-trade-checks.ts` | 8 pre-trade safety gates |
| `lib/strategies/trend-following.ts` | EMA crossover + ADX entry/exit |
| `lib/strategies/mean-reversion.ts` | Bollinger + RSI + ADX entry/exit |
| `lib/strategies/regime-detector.ts` | ADX-based regime classification |
| `lib/services/cron-logger.ts` | Plain-English activity logging |
| `app/dashboard/page.tsx` | Read-only status dashboard |
