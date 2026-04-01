# Epic 3b — Prediction Market Intelligence (Weeks 14–16)

## Goal
Add a parallel prediction market layer (Polymarket + Kalshi) that generates leading indicators for macro events. Signals enrich analyst prompts when strong enough, ignored when not.

## Go/No-Go Gate
- [ ] PM signals fire correctly on real market data
- [ ] Quality gate filters noise (most signals blocked, only strong ones pass)
- [ ] Bot decisions measurably change with strong PM signals
- [ ] Bot trades normally when no PM signals are active

## Prerequisites
Epic 3 gate PASSED.

---

## Story 3b.1 — Polymarket & Kalshi API Clients

**As a** developer  
**I want** clients that poll prediction market probabilities  
**So that** I can track probability movements over time

### Tasks
- Create `lib/services/polymarket.ts` — fetch market probabilities
- Create `lib/services/kalshi.ts` — fetch market probabilities
- Both: free read APIs, no auth required
- Handle: rate limits, missing markets, API changes

### Acceptance Criteria

**Given** a valid Polymarket market slug  
**When** `fetchMarketProbability(slug)` is called  
**Then** returns current probability (0-1) and volume

**Given** Kalshi KXFED market exists  
**When** `fetchKalshiMarket('KXFED')` is called  
**Then** returns current rate cut/hold probabilities

---

## Story 3b.2 — PM Tables & Polling Cron

**As a** developer  
**I want** prediction market data stored and polled regularly  
**So that** I can compute velocity and detect signals

### Tasks
- Create 3 Supabase tables: `pm_markets`, `pm_snapshots`, `prediction_signals`
- Seed `pm_markets` with 15–20 relevant markets (from blueprint Section 6)
- Create `app/api/cron/poll-prediction-markets/route.ts` (every 5 min)
- Store probability snapshots with timestamps

### Acceptance Criteria

**Given** 20 markets are seeded  
**When** the polling cron runs  
**Then** a snapshot is stored for each market with current probability and volume

---

## Story 3b.3 — Signal Detectors (Momentum, Divergence, Threshold)

**As a** developer  
**I want** 3 automatic signal detectors running on PM snapshots  
**So that** meaningful probability movements are captured

### Tasks
- Create `lib/prediction/momentum-detector.ts` — velocity > 0.02/hr + acceleration same sign
- Create `lib/prediction/divergence-detector.ts` — |Kalshi - FedWatch| > 10 points
- Create `lib/prediction/threshold-detector.ts` — probability crosses 50%, 70%, or 90%
- Create `app/api/cron/generate-pm-signals/route.ts` (every 15 min)

### Acceptance Criteria

**Given** P(rate cut) goes from 55% to 72% in 30 hours  
**When** momentum detector runs  
**Then** signal fires with velocity = ~0.006/hr

**Given** Kalshi says 75% rate cut, FedWatch says 60%  
**When** divergence detector runs  
**Then** signal fires with 15-point gap

---

## Story 3b.4 — Quality Gate

**As a** developer  
**I want** a quality gate that filters weak signals  
**So that** only high-conviction PM data reaches the analysts

### Tasks
- Create `lib/prediction/quality-gate.ts`
- 5 criteria (ALL must pass): strength > 0.6, maps to bot's instruments, < 12h old, no opposing signal of equal strength, volume > $100K/24h (Polymarket)
- Signals that pass → stored as "active" in `prediction_signals`

### Acceptance Criteria

**Given** a momentum signal with strength 0.4  
**When** quality gate evaluates  
**Then** signal is BLOCKED (below 0.6 threshold)

**Given** a strong signal (0.8) but volume $50K  
**When** quality gate evaluates  
**Then** signal is BLOCKED (below $100K volume)

**Given** all 5 criteria pass  
**When** quality gate evaluates  
**Then** signal is stored as "active"

---

## Story 3b.5 — LLM Scenario Analysis

**As a** developer  
**I want** a strong LLM to synthesize multiple PM signals into macro narratives  
**So that** analysts get contextual intelligence, not just raw numbers

### Tasks
- Create `app/api/cron/pm-scenario-analysis/route.ts` (every 6 hours)
- Collect all active PM signals → send to strong LLM
- LLM produces: narrative, instrument impacts, confidence score
- Create `lib/prediction/instrument-mapper.ts` — maps signals to bot's instruments
- Store as "llm_scenario" signal type in `prediction_signals`

### Acceptance Criteria

**Given** active signals for rate cut momentum + recession probability increase  
**When** scenario analysis runs  
**Then** LLM produces a narrative like "Rate cut + recession fear → long gold, reduce US30" with instrument mappings

---

## Story 3b.6 — Wire PM Signals into Analysts

**As a** developer  
**I want** the Macro and Sentiment analysts to read active PM signals  
**So that** prediction market intelligence enriches trading decisions

### Tasks
- Update `lib/agents/macro-analyst.ts` — query active PM signals from Supabase
- Update `lib/agents/sentiment-analyst.ts` — same
- Add PM context to prompts: "PREDICTION MARKET INTELLIGENCE: [signal details]"
- Prompt instructs: factor in but do not override technical signals

### Acceptance Criteria

**Given** 2 active PM signals exist  
**When** the Macro analyst runs  
**Then** its prompt includes both signals as additional context

**Given** no active PM signals exist  
**When** the Macro analyst runs  
**Then** it operates exactly as before (no PM section in prompt)
