# Mistakes & Lessons Learned

## Log
Format: `[DATE] MISTAKE — What happened — Root cause — Lesson`

- **[2026-04-03] MAX_DRAWDOWN never enforced** — The 30% drawdown circuit breaker was defined in `risk/constants.ts` but never imported or checked in `pre-trade-checks.ts` or `pipeline.ts`. Account reached 40.6% drawdown before this was caught. — Root cause: constants were defined as aspirational values but enforcement code was never written. — Lesson: Every constant in risk/constants.ts must have a corresponding check that imports and uses it. Add a test that verifies every exported constant is imported somewhere.
- **[2026-04-03] Transition regime dead code** — When ADX is 15-20 (transition), the regime detector allows trend following to run, but trend following internally requires ADX>20. This means trend following CAN NEVER fire in transition — 29.3% of all bars evaluate trend following for zero possible output. — Root cause: Regime thresholds were lowered (25→20, 20→15) but strategy thresholds were lowered differently (25→20), creating an impossible overlap zone. — Lesson: When adjusting thresholds across multiple layers, trace the full filter chain to ensure no dead zones.
- **[2026-04-03] GDELT nested quotes** — The `GEOPOLITICAL_QUERIES` array had double-quoted terms like `'"sanctions"'` that broke URL encoding. Every 4-hour GDELT ingest failed for the sanctions/tariff query (6x/day for the entire lifetime of the bot). — Root cause: Copy-paste from documentation without testing the actual API call. — Lesson: Test each external API query string independently before deploying.

---
*Add new mistakes below this line, newest first.*
