# Epic 3 — Full Agents & Self-Learning (Weeks 9–13)

## Goal
Replace the simplified technical-only pipeline with the full multi-agent debate system. Expand to all 6 instruments. Implement all 4 self-learning loops. Add economic calendar and central bank RSS.

## Go/No-Go Gate
- [ ] 200+ paper trades total
- [ ] Sharpe ratio > 0.7
- [ ] Self-learning loops demonstrably improve performance
- [ ] Maximum drawdown < 20%

## Prerequisites
Epic 2 gate PASSED.

---

## Story 3.1 — OpenRouter LLM Service (Dual Model)

**As a** developer  
**I want** a robust OpenRouter client with cheap/strong model routing  
**So that** agents can call the right model for their complexity level

### Tasks
- Enhance `lib/services/openrouter.ts`
- Support two model tiers: cheap (Gemini Flash / DeepSeek) and strong (Claude Sonnet)
- Add retry logic (3 attempts with exponential backoff)
- Add token tracking for cost monitoring
- Add timeout handling (30s max per call)

### Acceptance Criteria

**Given** a cheap model request  
**When** `callLLM({ tier: 'cheap', prompt })` is called  
**Then** it routes to the cheap model and returns a structured response

**Given** the first LLM call fails  
**When** retry logic kicks in  
**Then** it retries up to 3 times before throwing

**Given** a call exceeds 30 seconds  
**When** the timeout fires  
**Then** it throws a descriptive timeout error

---

## Story 3.2 — Agent Framework (4 Analysts)

**As a** developer  
**I want** 4 specialized analyst agents running in parallel  
**So that** trading decisions are informed by multiple perspectives

### Tasks
- Create `lib/agents/technical-analyst.ts` — reads indicators, outputs signal + confidence
- Create `lib/agents/sentiment-analyst.ts` — reads news sentiment, outputs bias
- Create `lib/agents/macro-analyst.ts` — reads economic calendar, outputs macro view
- Create `lib/agents/regime-analyst.ts` — reads ADX, outputs regime classification
- Create prompts in `prompts/` for each agent
- All 4 run in parallel (Promise.all)
- Each returns structured JSON scorecard

### Acceptance Criteria

**Given** fresh indicator and news data  
**When** all 4 analysts run in parallel  
**Then** each returns a scorecard with signal, confidence (0-1), and reasoning

**Given** one analyst LLM call fails  
**When** the pipeline runs  
**Then** the failing analyst is skipped and the remaining 3 still produce results

---

## Story 3.3 — Bull/Bear Debate System

**As a** developer  
**I want** Bull and Bear researchers to argue for/against each trade  
**So that** the Chief Analyst gets a balanced view

### Tasks
- Create `lib/agents/bull-researcher.ts` — argues FOR the proposed trade
- Create `lib/agents/bear-researcher.ts` — argues AGAINST
- Both receive: 4 analyst scorecards + current market data
- Create prompts in `prompts/`
- Run sequentially: Bull first, Bear sees Bull's argument

### Acceptance Criteria

**Given** 4 analyst scorecards suggesting long XAU_USD  
**When** Bull and Bear debate  
**Then** Bull presents supporting arguments, Bear presents counter-arguments

---

## Story 3.4 — Chief Analyst (Final Decision Maker)

**As a** developer  
**I want** a Chief Analyst that synthesizes all inputs into a final trade decision  
**So that** the bot has a single authoritative signal

### Tasks
- Create `lib/agents/chief-analyst.ts`
- Receives: 4 scorecards + Bull/Bear debate + agent weights from scorecards
- Outputs: `{ decision: 'long'|'short'|'hold', confidence: 0-1, reasoning: string }`
- Create prompt in `prompts/chief-analyst.md`
- Confidence below threshold → no trade

### Acceptance Criteria

**Given** strong consensus among analysts (3/4 agree)  
**When** Chief Analyst evaluates  
**Then** decision aligns with majority, high confidence

**Given** split opinions and weak arguments  
**When** Chief Analyst evaluates  
**Then** decision is 'hold' (caution wins)

---

## Story 3.5 — Full Pipeline (Replace Simplified)

**As a** developer  
**I want** the pipeline upgraded to use multi-agent debate  
**So that** the full decision-making process from the blueprint is operational

### Tasks
- Update `lib/pipeline.ts` to orchestrate: indicators → 4 analysts → debate → chief → risk → trade
- Keep technical-only as fallback (if LLM API fails)
- Pipeline must complete within 60 seconds per instrument
- Log every step for debugging

### Acceptance Criteria

**Given** all systems operational  
**When** pipeline runs for 1 instrument  
**Then** completes in < 10 seconds

**Given** OpenRouter is down  
**When** pipeline runs  
**Then** falls back to technical-only signals (no LLM agents)

---

## Story 3.6 — Expand to 6 Instruments

**As a** developer  
**I want** all 6 instruments active  
**So that** the bot trades the full universe

### Tasks
- Add: USD_JPY, BCO_USD, EUR_USD, US30_USD to ingest-candles
- Configure strategy per instrument (from blueprint Section 3)
- Update pipeline to loop all 6
- Verify total pipeline time stays under 60s

### Acceptance Criteria

**Given** 6 instruments configured  
**When** the pipeline runs  
**Then** all 6 are evaluated within 60 seconds total

---

## Story 3.7 — Learning Loop 1: Scorecards (Enhanced)

**As a** developer  
**I want** per-agent per-instrument scorecards with Darwinian weights  
**So that** better-performing agents have more influence

### Tasks
- Enhance `agent_scorecards` to track per-agent (not just per-strategy)
- Add `weight` column (bounded 0.3 to 2.5)
- Update scorecard updater to compute rolling accuracy
- Chief Analyst prompt reads weights when making decisions

### Acceptance Criteria

**Given** an agent with 70% accuracy on XAU_USD  
**When** weights are updated  
**Then** its weight increases (up to max 2.5)

---

## Story 3.8 — Learning Loop 2: Reflection (Every 10 Trades)

**As a** developer  
**I want** an LLM to review batches of trades for patterns  
**So that** insights are fed back into agent prompts

### Tasks
- Create `lib/learning/reflection-runner.ts`
- Create `lib/agents/reflection-agent.ts`
- Every 10 trades: send batch to cheap LLM for pattern analysis
- Store reflections in `reflections` table
- Inject recent reflections into analyst prompts

### Acceptance Criteria

**Given** 10 trades have completed since last reflection  
**When** the reflection runner fires  
**Then** a reflection is stored with win/loss patterns and recommendations

---

## Story 3.9 — Learning Loop 3: Weekly Health Review

**As a** developer  
**I want** a weekly deep review of system health  
**So that** degrading strategies are caught early

### Tasks
- Create `lib/learning/health-reviewer.ts`
- Compute: Sharpe ratio, Information Coefficient, alpha decay
- Use strong LLM for analysis
- Output: weight adjustments, strategy pause recommendations
- Create `app/api/cron/weekly-review/route.ts` (Sunday 00:00)

### Acceptance Criteria

**Given** a strategy with Sharpe < 0  
**When** weekly review runs  
**Then** it recommends pausing that strategy

---

## Story 3.10 — Learning Loop 4: Prompt Evolution (Monthly)

**As a** developer  
**I want** the worst-performing agent's prompt rewritten monthly  
**So that** agents improve over time

### Tasks
- Create `lib/learning/prompt-evolver.ts`
- Create `lib/learning/prompt-validator.ts` — checks for risk-language violations
- Identify worst agent → generate new prompt → 5-day shadow test → commit or revert
- Store versions in `prompt_versions` table
- Telegram alert on every evolution attempt

### Acceptance Criteria

**Given** one agent has the lowest scorecard  
**When** evolution triggers  
**Then** a new prompt is generated and enters 5-day shadow testing

**Given** the new prompt contains risk-override language  
**When** the validator runs  
**Then** the prompt is REJECTED

---

## Story 3.11 — Economic Calendar & Central Bank RSS

**As a** developer  
**I want** economic events and central bank statements ingested  
**So that** the Macro analyst has real-time context

### Tasks
- Create `lib/services/rss-parser.ts` — parse Fed/ECB/BoE RSS
- Create Supabase table: `economic_events`
- Create `app/api/cron/ingest-calendar/route.ts`
- Update news sentiment cron to include CB RSS
- High-impact events → flag Risk Gate to block trades 30 min before/after

### Acceptance Criteria

**Given** an FOMC decision is scheduled tomorrow  
**When** the calendar cron runs  
**Then** the event appears in `economic_events` with impact=high

**Given** a high-impact event is 20 minutes away  
**When** a trade signal fires  
**Then** pre-trade checks block the trade
