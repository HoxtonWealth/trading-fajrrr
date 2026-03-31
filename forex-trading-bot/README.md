# Autonomous Forex Trading Bot

Fully autonomous, self-learning forex trading bot operating on OANDA with $1K–$5K capital.

## Stack
- **Next.js** on Vercel (cron jobs, API routes, dashboard)
- **Supabase** (Postgres database — 14 tables)
- **OpenRouter** (LLM routing — cheap + strong models)
- **OANDA v20** (broker — practice & live)
- **Finnhub** (news + economic calendar)
- **Polymarket + Kalshi** (prediction market intelligence)
- **Telegram** (alerts)

## Current Architecture

Vercel handles everything: cron jobs run the trading pipeline, execute trades directly on OANDA, and manage all data ingestion. This is a simplified architecture for paper trading.

### Future: Add Render Monitor ($7/mo)

When transitioning to **live trading with real money**, add an always-on Render monitor (`forex-bot-monitor/`) for:
- **60-second polling** — trailing stop management (can't wait for 4-hour cron)
- **Circuit breakers** — close ALL positions immediately on 30% drawdown or 5% daily loss
- **Trade execution** — Vercel writes `pending` trades, Render executes on OANDA (decoupled)
- **Weekend handler** — real-time stop tightening on OANDA at Friday 19:30 UTC

The monitor code is already built in `forex-bot-monitor/`. To activate:
1. Deploy to Render as a Background Worker ($7/mo)
2. Change pipeline to write `status: 'pending'` instead of executing directly
3. Monitor reads pending trades from Supabase and executes on OANDA

**Do NOT skip the Render monitor for real money.** The 60-second loop is critical for risk management that serverless crons can't provide.

## Getting Started

### Prerequisites
- Node.js 20+
- OANDA practice account + API key
- Supabase project
- Vercel account (Pro for cron scheduling)
- OpenRouter API key
- Finnhub API key (free)
- Telegram bot (optional, for alerts)

### Setup
```bash
cd forex-trading-bot
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
```

### Supabase Setup
Run the 14 SQL migrations in order from `supabase/migrations/`:
```
001_create_candles.sql
002_create_indicators.sql
003_create_trades.sql
004_create_equity_snapshots.sql
005_create_agent_scorecards.sql
006_add_mean_reversion_indicators.sql
007_create_news_sentiment.sql
008_create_system_state.sql
009_create_trade_agent_predictions.sql
010_create_reflections_and_prompt_versions.sql
011_create_economic_events.sql
012_create_prediction_market_tables.sql
013_add_slippage_and_live_mode.sql
014_create_circuit_breaker_events.sql
```

### Environment Variables
See `.env.example` for all required variables.

## 11 Cron Routes

| Route | Schedule | Purpose |
|-------|----------|---------|
| `ingest-candles` | */15 min | H4 candles + indicators for 6 instruments |
| `ingest-equity` | */5 min | Equity, drawdown, daily P&L |
| `poll-prediction-markets` | */5 min | Polymarket + Kalshi probabilities |
| `generate-pm-signals` | */15 min | Momentum, divergence, threshold detection |
| `ingest-news-sentiment` | */4 hr | Finnhub news → LLM scoring |
| `run-pipeline` | */4 hr | Full agent pipeline → risk gate → trade |
| `pm-scenario-analysis` | */6 hr | Strong LLM macro narrative synthesis |
| `ingest-calendar` | Hourly | Economic events for next 7 days |
| `update-scorecards` | Daily | Trade stats + Darwinian weight updates |
| `weekly-review` | Sunday | Sharpe/IC analysis + reflections |
| `monthly-report` | 1st of month | Full performance report via Telegram |

## Project Structure
```
app/api/cron/          → 11 Vercel cron jobs
app/dashboard/         → Read-only status dashboard
lib/agents/            → 7 LLM agents (4 analysts, bull, bear, chief)
lib/indicators/        → Technical indicators (EMA, ADX, ATR, RSI, BB)
lib/learning/          → 4 self-learning loops
lib/prediction/        → Prediction market signal detectors + quality gate
lib/risk/              → Risk management (IMMUTABLE constants + checks)
lib/services/          → API clients (OANDA, Supabase, OpenRouter, Finnhub, Telegram, Polymarket, Kalshi)
lib/strategies/        → Trend following, mean reversion, regime detection
supabase/migrations/   → 14 SQL migrations
forex-bot-monitor/     → Render monitor (activate for live trading)
```

## Documentation
- **Blueprint:** `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md`
- **Epics:** `_bmad-output/planning-artifacts/epics/`
- **Architecture decisions:** `memory/decisions.md`
