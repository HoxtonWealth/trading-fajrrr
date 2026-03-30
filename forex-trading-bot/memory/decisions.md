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

---
*Add new decisions below this line, newest first.*
