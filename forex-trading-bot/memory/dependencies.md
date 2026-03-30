# Dependencies & API Quirks

## Known API behaviors
Format: `[DATE] SERVICE — Quirk — Impact — Workaround`

### OANDA v20 API (from docs review)
- Base URL practice: `https://api-fxpractice.oanda.com/v3`
- Base URL live: `https://api-fxtrade.oanda.com/v3`
- Auth: `Bearer` token in `Authorization` header
- Rate limit: 120 requests per second (generous)
- Candle granularity codes: `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D`, `W`, `M`
- Instrument format: `EUR_USD` (underscore, not slash)
- XAU/USD = `XAU_USD`, BCO/USD = `BCO_USD`, US30 = `US30_USD`

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
