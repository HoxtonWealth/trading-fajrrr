# Architectural Decisions

## Decision Log
Format: `[DATE] DECISION — Context — Alternatives considered — Why this choice`

### Pre-project decisions (from blueprint)
- **2 repos, not 1** — Vercel (serverless cron) and Render (always-on monitor) have different deployment models. Separate repos = independent deploys, no coupling.
- **Supabase as coordination layer** — Vercel and Render never call each other. They read/write Supabase tables. This avoids coupling and makes debugging easier.
- **Custom indicators, no library** — EMA, ADX, RSI, BB, ATR are simple math. No dependency = no version issues = no surprise API changes.
- **OpenRouter, not direct LLM APIs** — Single API key, switch models without code changes. Worth the small markup.
- **TypeScript strict mode** — Catch type errors at compile time, not at 3 AM when a trade fails.
- **risk/constants.ts is IMMUTABLE** — AI agents never import this file. Risk limits are hardcoded. This is the single most important design decision in the entire system.

### Session decisions
- **[2026-03-31] Broker swap: OANDA → Capital.com** — OANDA account setup was problematic. Capital.com offers REST API with demo environment, all required instruments (EURUSD, USDJPY, GOLD, OIL_CRUDE, EURGBP, US30), is SCA-regulated in UAE, and fits our architecture. Internal instrument names kept as OANDA-style (EUR_USD) throughout the codebase, translated to Capital.com epics (EURUSD, GOLD) at the API boundary only. Session-based auth (CST + X-SECURITY-TOKEN) replaces Bearer token. Position creation is 2-step (dealReference → confirm → dealId). All function signatures kept identical so no downstream code changes needed.
- **[2026-03-31] Skip Render monitor for paper trading** — Vercel pipeline executes trades directly on Capital.com instead of writing pending trades for a Render monitor. The monitor code (`forex-bot-monitor/`) is built and ready but not deployed. Will activate when transitioning to live trading with real money — the 60-second polling loop is critical for trailing stop management and circuit breaker enforcement that serverless crons can't provide.

---
*Add new decisions below this line, newest first.*
