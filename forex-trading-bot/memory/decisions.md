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

- **[2026-04-03] Trade frequency analysis — bottleneck ranking confirmed by data:**
  1. EMA crossover requirement is the #1 blocker (11 crossovers in 14 days, only 3 passed ADX>20)
  2. Transition regime makes trend following dead code (ADX 15-20 allows TF but TF needs ADX>20 — impossible)
  3. Mean reversion (34 signals) is 11x more productive than trend following (3 signals)
  4. Agent pipeline IS working (drove EUR_GBP trade despite no qualifying crossover) but 2/4 agents are effectively broken (sentiment=0.20, macro=always hold)
  5. Quick wins identified: lower TF ADX to 15, add BB proximity tolerance, relax RSI to 45/55, add more instruments
- **[2026-04-03] Circuit breaker enforcement** — MAX_DRAWDOWN (30%) was defined in constants but never checked anywhere. Drawdown reached 40.6%. Added pipeline-level halt + pre-trade check #9. Also enforced MAX_DAILY_LOSS (5%) halt.

- **[2026-04-05] Risk wall tuning — data-driven relaxation of secondary limits:**
  - MAX_OPEN_POSITIONS 6→8: 12 instruments + 1-2 week hold periods fill 6 slots in ~6 days, blocking new entries. 8 gives headroom without removing constraint.
  - TARGET_ANNUAL_VOL 15%→20%: 15% is conservative for forex, dampened gold/oil positions excessively. 20% lets vol targeting scale positions appropriately.
  - CIRCUIT_BREAKER_HALT_HOURS 48→24: 48h halt too long for a daily-trading strategy on a demo account in learning phase.
  - Leverage caps for XAU_USD, BCO_USD, US30_USD, US500_USD, GER40_EUR, XAG_USD: 10→15. Real protection is the 2% risk cap; leverage cap is a secondary safety net.
  - INSTRUMENT_CLUSTERS rebuilt: 6 instruments → 12 across 6 clusters. USD-shorts (EUR/GBP/AUD/NZD), JPY, Metals (XAU/XAG), Energy, Crosses, Indices (US30/US500/GER40). MAX_CLUSTER_POSITIONS=2 now meaningful.
  - Sentiment veto → 50% size reduction: Opposing sentiment was silently killing trades (hard return). Now reduces size by 50% instead, letting the risk gate (not sentiment) be the final arbiter.
  - Core safety limits UNCHANGED: MAX_RISK_PER_TRADE=2%, MAX_DAILY_LOSS=5%, MAX_DRAWDOWN=30%, DAILY_LOSS_BUFFER=4%, stops, circuit breakers.

---
*Add new decisions below this line, newest first.*
