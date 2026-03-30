# Epic 5 — Full Autonomy (Weeks 23+)

## Goal
Scale to $1K–$5K capital, full position sizes, once-daily human check. All self-learning loops and prediction market layer active. The bot runs itself.

## Ongoing Gate (Monthly Review)
- [ ] Sharpe ratio > 0.5 (rolling 3 months)
- [ ] Max drawdown < 20%
- [ ] Alpha decay not accelerating
- [ ] LLM costs within budget ($40–53/mo)
- [ ] No manual intervention needed for 30+ days

## Prerequisites
Epic 4 gate PASSED. 3 months profitable on real money.

---

## Story 5.1 — Scale Capital to $1K–$5K

**As a** developer  
**I want** to increase trading capital  
**So that** returns are meaningful relative to costs

### Tasks
- Fund OANDA live account to target amount
- Set position size multiplier to 1.0 (full)
- Verify risk constants still appropriate for larger capital
- Update `memory/decisions.md` with capital increase decision

### Acceptance Criteria

**Given** capital is increased  
**When** first trades execute at new size  
**Then** position sizes, stops, and risk percentages are correct for new equity

---

## Story 5.2 — Automated Monthly Report

**As a** developer  
**I want** a monthly performance report generated automatically  
**So that** I can review with minimal effort

### Tasks
- Create `app/api/cron/monthly-report/route.ts`
- Generate: total P&L, Sharpe, max drawdown, win rate per instrument, LLM costs, best/worst trades
- Send via Telegram as formatted message
- Store in Supabase for historical tracking

### Acceptance Criteria

**Given** a month of trading data  
**When** the monthly report runs  
**Then** a comprehensive summary is sent via Telegram

---

## Story 5.3 — Alpha Decay Monitoring

**As a** developer  
**I want** automatic detection of strategy degradation  
**So that** I'm alerted before losses accumulate

### Tasks
- Track rolling Sharpe (30-day, 60-day, 90-day)
- Track Information Coefficient per agent
- If 30-day Sharpe drops below 0 for 7 consecutive days → Telegram alert
- If IC drops below 0.02 for any agent → flag for evolution

### Acceptance Criteria

**Given** 30-day Sharpe has been negative for 7 days  
**When** the health check runs  
**Then** a WARNING alert is sent via Telegram

---

## Story 5.4 — Cost Optimization

**As a** developer  
**I want** to monitor and optimize LLM costs  
**So that** the bot stays profitable after infrastructure costs

### Tasks
- Track tokens used per model per day (already in OpenRouter dashboard)
- Monthly cost audit: LLM + Vercel + Render vs trading P&L
- If costs > 50% of gross P&L → alert
- Evaluate cheaper models periodically

### Acceptance Criteria

**Given** monthly costs are $50 and P&L is $80  
**When** cost audit runs  
**Then** cost ratio (62.5%) triggers a WARNING alert

---

## Story 5.5 — Dashboard (Optional)

**As a** developer  
**I want** a simple web dashboard showing bot status  
**So that** I can glance at performance without querying Supabase

### Tasks
- Build a simple page in the Next.js app (protected route)
- Show: current equity, open positions, today's P&L, drawdown, last 10 trades
- Show: agent scorecards, learning loop status
- Show: active PM signals
- Read-only — no trading actions from dashboard

### Acceptance Criteria

**Given** the dashboard URL  
**When** I visit it  
**Then** I see current bot status without needing to query Supabase manually

### Note
This is optional and low priority. The Telegram alerts + Supabase dashboard cover 90% of monitoring needs. Build only if you want a nicer interface.
