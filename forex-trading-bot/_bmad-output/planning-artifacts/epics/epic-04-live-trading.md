# Epic 4 — Live Trading (Weeks 17–22)

## Goal
Transition from paper to real money ($500–$1K). Start at 50% position sizes. Daily human review. Gradually scale to full size.

## Go/No-Go Gate
- [ ] 3 months profitable on real money
- [ ] Maximum drawdown < 15%
- [ ] Slippage within acceptable range (< 0.5 pip avg on majors)
- [ ] No circuit breaker triggered unexpectedly

## Prerequisites
Epic 3b gate PASSED. 16+ weeks of paper trading completed.

## ⛔ CRITICAL
**Never enter this phase if Epic 3 Sharpe is below 0.7.** Extend paper trading. Real money amplifies every flaw.

---

## Story 4.1 — Render Monitor (Second Repo)

**As a** developer  
**I want** an always-on monitor on Render  
**So that** positions are tracked, stops managed, and circuit breakers enforced 24/5

### Tasks
- Create second repo: `forex-bot-monitor`
- Create `index.ts` — main 60s polling loop
- Create `position-monitor.ts` — read open positions, manage trailing stops
- Create `circuit-breakers.ts` — 30% drawdown, flash crash, API outage
- Create `trade-executor.ts` — read `pending_trades` from Supabase, execute on OANDA
- Create `weekend-handler.ts` — Friday tighten, Sunday resume
- Create `lib/oanda.ts`, `lib/supabase.ts`, `lib/telegram.ts`
- Deploy to Render ($7/mo background worker)

### Acceptance Criteria

**Given** the monitor is running  
**When** Vercel writes a pending trade to Supabase  
**Then** the monitor executes it on OANDA within 60 seconds

**Given** equity drops 30% from peak  
**When** the circuit breaker checks  
**Then** ALL positions are closed, trading halts for 48 hours, Telegram critical alert sent

**Given** the OANDA API is unreachable  
**When** the monitor detects the outage  
**Then** new trades are blocked, existing stop losses remain on OANDA's server

---

## Story 4.2 — Telegram Alerts

**As a** developer  
**I want** Telegram notifications for trades, breakers, and health  
**So that** I can monitor the bot from my phone

### Tasks
- Create a Telegram bot (BotFather) and get token + chat ID
- Create `lib/services/telegram.ts` — direct HTTP POST
- Alert types: trade opened, trade closed, circuit breaker triggered, daily summary, weekly review
- Add alerts to: pipeline (trade), monitor (breaker), weekly review (health)

### Acceptance Criteria

**Given** a trade is executed  
**When** the alert fires  
**Then** a Telegram message shows: instrument, direction, size, stop loss, confidence

**Given** a circuit breaker triggers  
**When** the alert fires  
**Then** a CRITICAL Telegram message is sent immediately

---

## Story 4.3 — Switch to Live OANDA Account

**As a** developer  
**I want** to switch from practice to live OANDA  
**So that** real money is at stake

### Tasks
- Create OANDA live account and fund with $500–$1K
- Change `OANDA_BASE_URL` from practice to live
- Set position sizes to 50% of calculated (safety margin)
- Verify first live trade executes correctly
- Enable daily human review for first 2 weeks

### Acceptance Criteria

**Given** the live API key is configured  
**When** a trade signal fires  
**Then** a real trade is placed at 50% size on the live account

**Given** 2 weeks of live trading  
**When** daily review confirms no issues  
**Then** position sizes can be increased toward 75%, then 100%

---

## Story 4.4 — Slippage Tracking

**As a** developer  
**I want** to measure slippage on every trade  
**So that** I know if live execution matches paper expectations

### Tasks
- Add `expected_price` and `actual_price` columns to `trades` table
- Compute slippage = actual_price - expected_price
- Track avg slippage per instrument
- Alert if avg slippage exceeds 1 pip on majors

### Acceptance Criteria

**Given** 50 live trades  
**When** slippage is analyzed  
**Then** average slippage per instrument is reported in weekly review

---

## Story 4.5 — Gradual Scale-Up Protocol

**As a** developer  
**I want** a defined protocol for increasing position sizes  
**So that** scaling happens based on evidence, not emotion

### Tasks
- Week 1–2: 50% size, daily review
- Week 3–4: 75% size if drawdown < 10% and profitable
- Week 5+: 100% size if still profitable and Sharpe > 0.5
- Document in `memory/decisions.md`
- Automate size multiplier in `risk/constants.ts` (but manually changed — not AI-adjusted)

### Acceptance Criteria

**Given** 2 weeks at 50% size with < 10% drawdown  
**When** human reviews  
**Then** size multiplier can be manually increased to 0.75
