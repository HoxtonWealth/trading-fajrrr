# Dependencies & API Quirks

## Known API behaviors
Format: `[DATE] SERVICE — Quirk — Impact — Workaround`

### Capital.com REST API
- Demo base URL: `https://demo-api-capital.backend-capital.com`
- Live base URL: `https://api-capital.backend-capital.com`
- Auth: session-based. POST `/api/v1/session` with `X-CAP-API-KEY` header + `{identifier, password}` body → returns `CST` and `X-SECURITY-TOKEN` in response headers
- Session timeout: 10 minutes of inactivity — re-auth at start of each pipeline run
- Rate limit: 10 req/sec, 1 position req per 0.1s, 1000 position req/hour on demo
- Instrument format: "epics" — EURUSD, GOLD, OIL_CRUDE, US30 (NOT underscore format)
- Internal instrument names stay OANDA-style (EUR_USD) — translated at API boundary only
- Position creation is 2-step: POST `/api/v1/positions` → `{dealReference}` → GET `/api/v1/confirms/{dealReference}` → `{dealId, level, dealStatus}`
- Close position: DELETE `/api/v1/positions/{dealId}` (not PUT like OANDA)
- Update stop loss: PUT `/api/v1/positions/{dealId}` with `{stopLevel}`
- Price data: bid/ask objects `{openPrice: {bid, ask}}` — we use mid-price (avg bid+ask)
- Granularity: MINUTE, MINUTE_5, MINUTE_15, MINUTE_30, HOUR, HOUR_4, DAY, WEEK
- No account ID in URL path — account selected via X-SECURITY-TOKEN
- Instrument mapping: EUR_USD→EURUSD, USD_JPY→USDJPY, XAU_USD→GOLD, BCO_USD→OIL_CRUDE, EUR_GBP→EURGBP, US30_USD→US30

### Supabase
- Free tier: 500 MB database, 2 GB bandwidth, 50K monthly active users
- Row-level security: must create policies or disable RLS on service tables
- Timestamps: use `timestamptz` (with timezone), not `timestamp`

### Vercel
- Pro plan: 60-second function timeout, cron jobs down to every 1 minute
- Cron config in `vercel.json`
- Environment variables set in Vercel dashboard, not committed to repo

### OpenRouter
- Base URL: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Bearer` token in `Authorization` header
- Must set `HTTP-Referer` and `X-Title` headers
- Model IDs change — always check current model strings

---
*Add new discoveries below this line, newest first.*
