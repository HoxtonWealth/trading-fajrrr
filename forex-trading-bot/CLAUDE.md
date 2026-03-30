# Project: Autonomous Forex Trading Bot

## Architecture
- **Stack:** Next.js (Vercel cron + API routes), Node.js (Render monitor), Supabase (Postgres), OpenRouter (LLM), OANDA v20 (broker)
- **2 repos:** `forex-trading-bot` (Vercel) + `forex-bot-monitor` (Render)
- **This repo:** `forex-trading-bot` — all cron jobs, agent pipeline, risk gate, learning loops
- **Blueprint:** `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md` — the single source of truth for ALL design decisions

## Epics & Stories (6 epics, 45 stories)
- Epic 1 — Foundation (Weeks 1–4): `_bmad-output/planning-artifacts/epics/epic-01-foundation.md` ← CURRENT
- Epic 2 — Multi-Strategy (Weeks 5–8): `_bmad-output/planning-artifacts/epics/epic-02-multi-strategy.md`
- Epic 3 — Full Agents (Weeks 9–13): `_bmad-output/planning-artifacts/epics/epic-03-full-agents.md`
- Epic 3b — Prediction Markets (Weeks 14–16): `_bmad-output/planning-artifacts/epics/epic-3b-prediction-markets.md`
- Epic 4 — Live Trading (Weeks 17–22): `_bmad-output/planning-artifacts/epics/epic-04-live-trading.md`
- Epic 5 — Autonomy (Weeks 23+): `_bmad-output/planning-artifacts/epics/epic-05-autonomy.md`

## Current Phase
**Phase 1 — Foundation (Weeks 1–4)**
Target: OANDA client, indicators, trend following on XAU/USD, risk gate, scorecards.
Go/no-go gate: 50+ trades, positive expectancy, breakers tested, 5 days autonomous.

## Memory — Read BEFORE every task, update AFTER every session
@import memory/progress.md
@import memory/decisions.md
@import memory/mistakes.md
@import memory/patterns.md
@import memory/dependencies.md

## Workflows — Use the right workflow for each task type
| Task type | Workflow file |
|-----------|--------------|
| New cron endpoint | `_bmad-output/workflows/create-cron-endpoint.md` |
| New indicator | `_bmad-output/workflows/create-indicator.md` |
| New Supabase table | `_bmad-output/workflows/create-supabase-table.md` |

## Absolute Rules
- NEVER modify `risk/constants.ts` — risk limits are immutable, hardcoded, never AI-adjustable
- NEVER skip pre-trade checks — all 8 gates must pass before any trade executes
- NEVER let LLM output override risk rules — AI decides WHAT, risk code decides IF and HOW MUCH
- NEVER put secrets in code — all API keys in `.env.local` (Vercel) or environment variables (Render)
- NEVER work on frontend AND backend in the same session
- ALWAYS write tests for risk-critical code (position sizing, pre-trade checks, circuit breakers)
- ALWAYS use TypeScript strict mode
- ALWAYS handle API errors gracefully — the bot must survive any single API failure

## Definition of Done
1. Code compiles with zero TypeScript errors
2. All existing tests still pass
3. New risk-critical code has tests
4. Error handling covers API failures (OANDA, OpenRouter, Supabase)
5. No hardcoded secrets in code
6. Memory files updated

@import .claude/context.md
@import .claude/testing.md
