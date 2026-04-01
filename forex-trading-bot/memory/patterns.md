# Working Patterns

## Patterns discovered during development
Format: `[DATE] PATTERN — Description — Reference file`

- **[2026-03-31] Capital.com session auth** — Sessions expire after 10 min of inactivity. `ensureSession()` checks timestamp and re-authenticates if needed before every API call. CST and X-SECURITY-TOKEN stored in module-level variables. On 401 response, session is cleared so next call re-authenticates. — `lib/services/capital.ts`
- **[2026-03-31] Instrument name translation at boundary** — All internal code uses OANDA-style names (EUR_USD, XAU_USD). Translation to Capital.com epics (EURUSD, GOLD) happens only inside capital.ts via `toEpic()` and `fromEpic()`. This avoids touching 50+ files across strategies, indicators, Supabase tables, and agents. — `lib/services/capital.ts`
- **[2026-03-31] 2-step order confirmation** — Capital.com position creation returns `dealReference`, not a fill. Must call `/api/v1/confirms/{dealReference}` to get `dealId` (the actual trade ID) and fill price. 500ms delay between create and confirm to allow processing. — `lib/services/capital.ts`

---
*Add new patterns below this line, newest first.*
