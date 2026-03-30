# Autonomous Self-Learning Forex Trading Bot

## Complete System Blueprint v3.0

*With prediction market intelligence layer*

---

**Capital:** $1,000 – $5,000 | **Broker:** OANDA v20 | **Mode:** Fully Autonomous

**Stack:** Next.js, Vercel, Render, Supabase, OpenRouter, GitHub

**Data:** OANDA, Finnhub, Polymarket, Kalshi, Central Bank RSS

**Max Drawdown:** 30% | **Assets:** 6 Instruments | **Self-Learning:** 4 Loops

*March 2026 | Fajrrr Studio*

---

## 1. Executive summary

This blueprint defines a fully autonomous, self-learning forex trading bot operating on OANDA with $1K–$5K capital. The system uses a multi-agent AI architecture where specialized LLM agents debate trading decisions, with four self-learning loops and a parallel prediction market intelligence layer. Risk management is enforced by immutable code rules that the AI can never override.

> **Core design philosophy**
>
> The bot does not predict the future. It identifies the current market regime, activates the appropriate strategy, sizes positions based on conviction and volatility, and enforces hard risk limits. Prediction is replaced by adaptation. A parallel prediction market layer provides leading indicators for macro events — when signals are strong enough, they enrich the agents' analysis. When they're not, the bot trades exactly as before. The AI decides WHAT to trade. The risk code decides IF and HOW MUCH. The risk code always wins.

---

## 2. Strategy stack (4 layers)

### Layer 1: Regime detection (the brain)

ADX-based classification determines which strategy runs. ADX > 25 activates trend following. ADX < 20 activates mean reversion. ADX 20–25 is a transition zone (both at 50% size).

### Layer 2a: Trend following (core strategy)

| Parameter | Value |
|-----------|-------|
| Entry | EMA(20) crosses EMA(50) AND ADX(14) > 25 |
| Exit | EMA crossover reversal, OR ADX < 20, OR trailing stop hit |
| Stop | 2x ATR(14) trailing stop. Trails in profit direction only. |
| Win rate | 35–45% (compensated by 1:2.5 to 1:4 risk/reward) |
| Best for | XAU/USD (gold), USD/JPY, BCO/USD |

### Layer 2b: Mean reversion (range strategy)

| Parameter | Value |
|-----------|-------|
| Entry | BB(20,2) touch + RSI(14) < 30 + ADX(14) < 20 |
| Exit | Middle Bollinger Band (20-period SMA) OR stop hit |
| Stop | 1.5x ATR(14) fixed stop beyond entry Bollinger Band |
| Win rate | 55–65% (with 1:1 to 1:1.5 risk/reward) |
| Best for | EUR/GBP (ideal), EUR/USD during ranging periods |

### Layer 3: LLM sentiment bias (the edge)

Sentiment score (−1.0 to +1.0) per instrument via OpenRouter. Score > +0.5 boosts long size 25–50%. Score < −0.5 boosts short. Never overrides signals or risk rules. Updated every 4 hours.

### Layer 4: Multi-agent debate (quality gate)

Four analysts (Technical, Sentiment, Macro, Regime) run in parallel. Bull Researcher argues FOR, Bear argues AGAINST. Chief Analyst receives debate + scorecards + prediction market intelligence, makes final call.

---

## 3. Instrument universe (6 assets, 6 clusters)

| Cluster | Instrument | Driver | Strategy | Why selected |
|---------|-----------|--------|----------|-------------|
| 1: Anti-USD | **EUR/USD** | Fed vs ECB policy | Both | Most liquid, tightest spreads |
| 2: JPY | **USD/JPY** | BoJ policy, risk sentiment | Trend | Uncorrelated with EUR/USD |
| 3: Metals | **XAU/USD** | Safe haven, inflation | Trend | Strongest trending asset |
| 4: Energy | **BCO/USD** | OPEC, geopolitics | Trend | Low forex correlation |
| 5: Crosses | **EUR/GBP** | UK vs Eurozone | Mean rev | Ideal range-trading pair |
| 6: Indices | **US30** | Equity risk appetite | Trend | Inverse to gold |

**Constraint:** Max 2 per cluster. If 20-day Pearson correlation > 0.7, halve size or skip.

---

## 4. Risk management framework

> ⛔ **Cardinal rule**
>
> Risk limits are hard floors and ceilings. Never overridden by conviction, sentiment, prediction markets, or model output. The self-learning system can NEVER adjust any value in this section. Enforced in `risk/constants.ts`, which AI agents never import.

### Gate 1: Pre-trade checks (8 checks, all must pass)

| # | Check | Rule |
|---|-------|------|
| 1 | Max risk per trade | Position risk ≤ 2% of equity (even if Kelly suggests more) |
| 2 | Leverage cap | Major forex ≤ 20:1, minor ≤ 15:1, commodities ≤ 10:1, indices ≤ 10:1 |
| 3 | Daily trade count | Maximum 10 trades per day across all instruments |
| 4 | Open positions | Maximum 6 simultaneous positions |
| 5 | Cluster limit | Maximum 2 from same correlation cluster |
| 6 | Correlation | 20-day Pearson > 0.7 with any open position → halve or skip |
| 7 | Spread filter | No trades when spread > 2x instrument average |
| 8 | Daily loss buffer | No new trades if daily P&L at −4% (buffer before −5% halt) |

### Gate 2: Active monitoring

Trailing stops (2x ATR trend, 1.5x ATR mean rev). Regime mismatch: close mean reversion on trend shift. 5% daily loss → close all, halt until next day. Friday 19:30 UTC: tighten to 1x ATR, close MR, block entries until Sunday 22:00.

### Gate 3: Circuit breakers

| Trigger | Action | Recovery |
|---------|--------|----------|
| 30% max drawdown | Close ALL. Full halt 48h. Telegram critical alert. | Days 3–7: 50%. Days 8–14: 75%. Day 15+: full IF recovered 5%. |
| Flash crash (>3% / 5 min) | Close ALL. Safe mode 24h. | Resume normal after 24h. |
| OANDA API outage | Block new trades. Stops remain server-side. | Auto-resume when API responds. |
| LLM API failure | Disable sentiment + debate. Technicals only. | Auto-re-enable when OpenRouter responds. |

### Position sizing

1. **Half-Kelly:** f* = (p×b − q)/b × 0.5, capped at 2%
2. **Position size:** units = (equity × risk%) / (ATR × stop_multiplier)
3. **Volatility targeting:** units ×= target_vol / estimated_vol (target 15% annualised)
4. **Sentiment modifier:** ×1.25 if confirms, ×0 if opposes

### The immutable wall

| AI CAN adjust | AI can NEVER adjust |
|---------------|---------------------|
| Agent prompts | 2% max risk per trade |
| Scorecard weights | 5% daily loss limit |
| Strategy thresholds | 30% drawdown breaker |
| Signal combination logic | Leverage caps |
| Entry timing preferences | Position count limits |
| Confidence calibration | Correlation constraints |
| Which instruments to focus on | Stop loss mechanics |
| Bull/Bear debate structure | Weekend protocol |
| Sentiment scoring approach | Recovery timelines |

---

## 5. Self-learning engine (4 loops)

| Loop | Frequency | What it does | LLM | Output |
|------|-----------|-------------|-----|--------|
| 1. Scorecards | Every trade | Log prediction vs outcome. Rolling accuracy per agent per instrument. | None (SQL) | Weights, SEEK/AVOID labels |
| 2. Reflection | Every 10 trades | LLM analyzes batch for win/loss patterns and agent performance. | Cheap | Insights injected into prompts |
| 3. Health review | Weekly | Sharpe, IC, alpha decay. Includes prediction signal accuracy review. | Strong | Weight changes, strategy pauses |
| 4. Evolution | Monthly | Rewrite worst agent prompt. Shadow test 5 days. Commit or revert. | Strong | Evolved prompts (30% survive) |

**Guardrails:** 1 agent evolves at a time, max 2 attempts/month, prompt validation for risk language, 5-day shadow test, Telegram alert on every change, Darwinian weights bounded 0.3–2.5.

---

## 6. Prediction market intelligence layer

> **Parallel system design**
>
> The prediction layer runs independently of the trading pipeline on its own schedule. It produces signals stored in Supabase. The Macro and Sentiment analysts read these signals during their normal pipeline run — but ONLY when signals pass a strength threshold (> 0.6). If no signals are strong enough, the bot trades exactly as before. This layer is purely additive: it can help but can never hurt by being absent.

**Academic validation:** A 2026 Federal Reserve study confirmed that Kalshi's rate forecasts perfectly matched every FOMC outcome since 2022, outperforming Fed Funds Futures and professional surveys. Prediction markets provide statistically significant incremental information, particularly for macro events where derivatives markets are thin.

### Data sources (all free, no auth for reads)

| Platform | Key markets | Your instruments | Free tier |
|----------|------------|-----------------|-----------|
| **Kalshi** | Fed rate (KXFED), CPI (KXCPI), GDP, unemployment | EUR/USD, USD/JPY, XAU/USD, US30 | 20 reads/sec, no auth |
| **Polymarket** | Recession, tariffs, oil targets, geopolitical events | XAU/USD, BCO/USD, EUR/USD, US30 | 4000 req/10sec, no auth |
| **Metaculus** | Long-horizon economic forecasts, GDP, policy | All (background context) | Public, poll every 6h |

### 4 signal types

| Signal | How it works | Example | Computation |
|--------|-------------|---------|-------------|
| **Momentum** | Tracks probability velocity (dP/dt) and acceleration. Fires when conviction is building rapidly. | P(rate cut) goes 55%→72% in 30h. Velocity = 0.006/hr. | Auto-computed every 15 min |
| **Divergence** | Exploits gaps between prediction markets and traditional indicators (e.g. Kalshi vs FedWatch). | Kalshi 75% rate cut vs FedWatch 60% = 15pt gap. | Auto-computed, PM vs derivatives |
| **Threshold crossing** | Fires when probability crosses 50%, 70%, or 90% boundaries. Maps to portfolio actions. | P(recession) crosses 70% → long gold, reduce US30. | Auto-computed on snapshot insert |
| **LLM scenario** | Strong LLM connects multiple PM signals into a coherent macro narrative mapped to instruments. | Tariffs + recession fear + rate cut = long gold, short USD. | Every 6h via OpenRouter (strong) |

### Quality gate (signal must pass ALL criteria)

1. **Strength** > 0.6 (auto signals) or LLM confidence > 0.6 (scenarios)
2. **Maps to** at least one of the bot's 6 instruments
3. **Generated within** last 12 hours
4. **No opposing** signal of equal or greater strength
5. **Volume** > $100K/24h (Polymarket only, filters thin markets)

If gate blocks everything, bot trades normally — prediction layer is purely additive.

### How signals reach the trading bot

Signals that pass the quality gate are stored in `prediction_signals` with status "active." The Macro Analyst and Sentiment Analyst query this table during each pipeline run. Active signals appear as additional context in their prompts: "PREDICTION MARKET INTELLIGENCE: [signal details]." The prompt instructs agents to factor these in but not let them override technical signals. Same pattern as news headlines and economic calendar — just another data source.

---

## 7. Live data sources and ingestion

All data pulled via Vercel cron functions calling free APIs, scored by OpenRouter. No external workflow tools.

### Financial news

Finnhub (primary, 60 calls/min free): forex news headlines. Marketaux (secondary, 100 calls/day free): broader geopolitical coverage. Alpha Vantage (backup, 25 calls/day free): news with built-in sentiment. Central bank RSS feeds (Fed, ECB, BoE): official press releases, free public XML. All fetched every 4 hours by a single Vercel cron function.

### Economic calendar

Finnhub economic calendar API (free tier): CPI, NFP, GDP, rate decisions for all major economies. Fetched hourly. High-impact events flag the Risk Gate to block trades 30 minutes before/after release.

### Combined LLM scoring call

One OpenRouter call (cheap model) every 4 hours processes all news headlines, central bank RSS, and economic calendar simultaneously. Returns per-instrument: sentiment score (−1 to +1), central bank hawk/dove score, geopolitical risk (0 to 1), key reasoning, high-impact events ahead, and trade bias. One call does triple duty.

---

## 8. System architecture

### Platform split (3 platforms)

| Platform | Responsibility | Cost |
|----------|---------------|------|
| **Render ($7/mo)** | Always-on monitor: 60s polling, circuit breakers, trailing stops, trade execution, weekend handler, critical Telegram alerts | $7/month |
| **Vercel Pro ($20/mo)** | All cron jobs: OANDA data, news/calendar ingestion, prediction market polling, agent pipeline, risk gate, learning loops, PM signal generation, Telegram alerts | $20/month |
| **Supabase (free)** | Single source of truth: 14 tables, ~13 MB/month. Coordinates all platforms. | $0/month |
| **OpenRouter** | Dual-LLM: cheap model (sentiment, debate, chief, reflection, PM scenarios) + strong model (weekly review, evolution, deep PM analysis) | $13–26/month |

**Total: ~$40–53/month at full production. ~$13–26 during paper trading.**

### Supabase tables (14 total)

**Market data (4):** `candles`, `indicators`, `news_sentiment` (with cb_hawk_dove_score, geopolitical_risk, high_impact_events), `economic_events`

**Trading (2):** `trades`, `trade_agent_predictions`

**Learning (3):** `agent_scorecards`, `reflections`, `prompt_versions`

**Risk (2):** `equity_snapshots`, `circuit_breaker_events`

**Prediction markets (3):** `pm_markets`, `pm_snapshots`, `prediction_signals`

### Vercel cron schedule (11 jobs)

| Cron function | Frequency | What it does |
|--------------|-----------|-------------|
| `ingest-candles` | Every 15 min | Fetch OANDA H4 candles for 6 instruments, compute indicators |
| `ingest-equity` | Every 5 min | Snapshot account equity, check drawdown |
| `ingest-news-sentiment` | Every 4 hours | Finnhub + Marketaux + central bank RSS → LLM scoring → Supabase |
| `ingest-calendar` | Every 1 hour | Finnhub economic calendar for next 7 days |
| `poll-prediction-markets` | Every 5 min | Fetch Polymarket + Kalshi probabilities, store snapshots, compute velocity |
| `generate-pm-signals` | Every 15 min | Scan snapshots for momentum, divergence, threshold signals. Quality gate. |
| `pm-scenario-analysis` | Every 6 hours | LLM connects active PM signals into macro narrative for instruments |
| `run-pipeline` | Every H4 candle | Full agent pipeline: 4 analysts → debate → chief → risk gate → execute |
| `update-scorecards` | Daily 00:00 | Recompute all agent scorecards + prediction signal accuracy |
| `weekly-review` | Sunday 00:00 | Loop 3: Sharpe, IC, alpha decay, PM signal performance review |
| `send-alerts` | Event-driven | Telegram alerts for trades, breakers, evolution (direct HTTP POST) |

### Trading pipeline (every H4, ~30–48s)

Steps 1–2: Fetch candles, compute indicators (0.8s). Steps 3–6: 4 analysts in parallel — Technical (code), Sentiment (news + PM signals from Supabase), Macro (calendar + PM scenarios from Supabase), Regime (code) — total ~2.5s. Step 7: Bull/Bear debate (3s). Step 8: Chief Analyst (2s). Step 9: Risk Gate 8 checks (0.3s). Step 10: Execute via Render (1s). Step 11: Telegram alert (0.5s). Per instrument ~8s. All 6: ~48s.

### Communication pattern

Vercel and Render never call each other directly. They coordinate through Supabase tables: `pending_trades` (Vercel writes, Render executes), `system_state` (Render writes breaker status, Vercel reads), `trades` (both read/write). Both send Telegram alerts directly via HTTP POST.

### File structure

**Repo 1: `forex-trading-bot` (Vercel)**

```
app/api/cron/
├── ingest-candles/route.ts
├── ingest-equity/route.ts
├── ingest-news-sentiment/route.ts
├── ingest-calendar/route.ts
├── poll-prediction-markets/route.ts
├── generate-pm-signals/route.ts
├── pm-scenario-analysis/route.ts
├── run-pipeline/route.ts
├── update-scorecards/route.ts
├── weekly-review/route.ts
└── evolution/
    ├── identify-weakest/route.ts
    ├── mutate-prompt/route.ts
    └── evaluate-shadow/route.ts

lib/
├── agents/
│   ├── technical-analyst.ts
│   ├── sentiment-analyst.ts
│   ├── macro-analyst.ts
│   ├── regime-analyst.ts
│   ├── bull-researcher.ts
│   ├── bear-researcher.ts
│   ├── chief-analyst.ts
│   └── reflection-agent.ts
├── risk/
│   ├── constants.ts              ← IMMUTABLE
│   ├── position-sizer.ts
│   ├── pre-trade-checks.ts
│   └── correlation.ts
├── indicators/
│   ├── ema.ts
│   ├── adx.ts
│   ├── rsi.ts
│   ├── bollinger.ts
│   └── atr.ts
├── learning/
│   ├── scorecard-updater.ts
│   ├── reflection-runner.ts
│   ├── health-reviewer.ts
│   ├── prompt-evolver.ts
│   └── prompt-validator.ts
├── prediction/
│   ├── momentum-detector.ts
│   ├── divergence-detector.ts
│   ├── threshold-detector.ts
│   ├── quality-gate.ts
│   └── instrument-mapper.ts
├── services/
│   ├── oanda.ts
│   ├── openrouter.ts
│   ├── supabase.ts
│   ├── telegram.ts
│   ├── finnhub.ts
│   ├── marketaux.ts
│   ├── rss-parser.ts
│   ├── polymarket.ts
│   └── kalshi.ts
└── pipeline.ts

prompts/
├── technical-analyst.md
├── sentiment-analyst.md
├── macro-analyst.md
├── bull-researcher.md
├── bear-researcher.md
├── chief-analyst.md
└── reflection-agent.md
```

**Repo 2: `forex-bot-monitor` (Render)**

```
├── index.ts                 ← Main 60s loop
├── position-monitor.ts
├── circuit-breakers.ts
├── trade-executor.ts
├── weekend-handler.ts
└── lib/
    ├── oanda.ts
    ├── supabase.ts
    └── telegram.ts
```

---

## 9. Build roadmap (5 phases, 22+ weeks)

| Phase | Weeks | Cost | What you build | Go/No-go gate |
|-------|-------|------|---------------|---------------|
| **1. Foundation** | 1–4 | $0 | OANDA, indicators, trend following XAU/USD, risk gate, Render monitor, scorecards | 50+ trades, positive expectancy, breakers tested, 5 days autonomous |
| **2. Multi-strategy** | 5–8 | $11–15 | Mean reversion, regime switching, EUR/GBP, LLM sentiment, news ingestion, sessions | 100+ trades, Sharpe > 0.5, regime switching works, 10 days autonomous |
| **3. Full agents** | 9–13 | $20–30 | Multi-agent debate, 6 instruments, all 4 learning loops, Darwinian evolution, econ calendar, CB RSS | 200+ trades, Sharpe > 0.7, self-learning improves, DD < 20% |
| **3b. Prediction** | 14–16 | $22–34 | Polymarket + Kalshi polling, 4 signal types, quality gate, LLM scenarios, wire into Macro + Sentiment | PM signals fire correctly, quality gate filters noise, bot decisions improve |
| **4. Live trading** | 17–22 | $40–53 | Real money $500–$1K, 50% sizes, daily review, scale to full | 3 months profitable, max DD < 15%, slippage OK |
| **5. Autonomy** | 23+ | $40–53 | $1K–$5K, full sizes, once-daily check, all loops + PM active | Ongoing monthly review, alpha decay monitoring |

> ⛔ **Critical rule:** Never skip a gate. If Phase 3 Sharpe is below 0.7, do NOT proceed to real money. Extend paper trading. The 16+ weeks of paper trading before live capital exist because strategies that work in theory frequently fail live.

### Phase 1 first-week task list (start here)

**Day 1–2:** Create both GitHub repos. Set up Supabase with first 4 tables (`candles`, `indicators`, `trades`, `equity_snapshots`).

**Day 3–4:** Build OANDA v20 client (`lib/services/oanda.ts`). Test: fetch candles, get account summary, place/cancel test order. Build candle ingestion cron for XAU/USD.

**Day 5–7:** Build equity snapshot cron. Deploy to Vercel. Verify crons and Supabase fill. **End-of-week check:** 48+ hours of data in Supabase.

### Phase 3b prediction layer build (Weeks 14–16)

**Week 14:** Build Polymarket and Kalshi API clients (`lib/services/`). Create 3 Supabase tables (`pm_markets`, `pm_snapshots`, `prediction_signals`). Seed 15–20 relevant markets. Build polling cron (every 5 min). Build momentum, divergence, threshold detectors. Build quality gate. Verify snapshots accumulate and signals fire.

**Week 15:** Build LLM scenario analysis cron (every 6h, strong model). Build instrument mapper. Wire `prediction_signals` into Macro and Sentiment analyst prompts. Add PM signal tracking to scorecards. Test: does bot change decisions with strong signals? Does it trade normally without?

**Week 16:** Full validation with prediction layer active. Compare trades WITH vs WITHOUT prediction context. Start prediction signal accuracy tracking.

---

## 10. Complete tech stack

| Role | Technology | Why |
|------|-----------|-----|
| Pipeline + cron | **Next.js on Vercel** | 11 cron jobs for all scheduling. API routes for webhooks. |
| Always-on monitor | **Node.js on Render** | Persistent 60s loop for positions, breakers, execution. |
| Database | **Supabase (Postgres)** | 14 tables, free tier for 2+ years. Central nervous system. |
| Fast LLM (90%) | **Gemini Flash / DeepSeek** | Sentiment, debate, chief, reflection, PM scenarios. ~$10–18/mo. |
| Strong LLM (10%) | **Claude Sonnet** | Weekly review, evolution, deep PM analysis. ~$3–8/mo. |
| LLM routing | **OpenRouter** | Single API for all models. Switch without code changes. |
| Broker | **OANDA v20 REST** | Practice for paper, live when ready. Free. |
| News data | **Finnhub + Marketaux** | Free APIs. Forex news, economic calendar, entity detection. |
| Central bank | **Official RSS feeds** | Fed, ECB, BoE. Free public XML, fast-xml-parser. |
| Prediction markets | **Polymarket + Kalshi** | Free read APIs. Fed rates, CPI, recession, tariffs, GDP, oil. |
| Alerts | **Telegram Bot API** | Direct HTTP POST. Free. |
| Indicators | **Custom TypeScript** | EMA, ADX, RSI, BB, ATR. Simple math, no library. |
| Source code | **GitHub (2 repos)** | forex-trading-bot (Vercel) + forex-bot-monitor (Render). |

**Not in the stack:** Python, Docker, Redis, WebSockets, n8n, Mastra, or any external workflow tools.

---

## 11. Top 5 risks and mitigations

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | LLM agents don't beat buy-and-hold | Academic benchmarks show most LLM traders underperform. | Edge from regime detection + risk management + self-learning + prediction markets. 16+ weeks paper trading. |
| 2 | Self-learning overfitting | Bot optimizes for recent data, fails on regime change. | Soft context Loop 2, multi-day testing Loops 3/4, shadow test evolution, max 2 attempts/month. |
| 3 | Infrastructure failure | Render or Vercel down with open positions. | OANDA stops are server-side. Platforms independent. Stops set at entry. |
| 4 | Costs exceed returns | $40–53/mo needs 1–2% monthly return on $3K. | Paper trade at $13–26/mo. Scale only when profitable. Monthly cost audit. |
| 5 | Weekend gap | Sunday open skips stop loss. | Friday 19:30: close MR, tighten to 1x ATR, block entries. |

---

## 12. Key formulas reference

**Kelly criterion:** f* = (p×b − q)/b, where p = win probability, b = avg win / avg loss, q = 1 − p. Half-Kelly = f* × 0.5.

**ATR stop loss:** Stop distance = ATR(14) × multiplier (2.0 trend, 1.5 mean reversion). Position size = (equity × risk%) / stop distance.

**Volatility targeting:** Leverage multiplier = target_vol / estimated_vol. Target = 15% annualised. Estimated vol = (ATR / close) × √252.

**Correlation check:** Rolling Pearson(returns_A, returns_B, window=20). If > 0.7, reduce size 50% or skip.

**Regime classification:** Trending = ADX > 25. Ranging = ADX < 20. Transition = ADX 20–25.

**Bollinger entry:** Long when price touches lower band AND RSI(14) < 30 AND ADX(14) < 20.

**Sharpe ratio:** (avg_return / std_dev) × √252. Below 0.3 = reduce size. Below 0 = pause strategy.

**Information Coefficient:** Pearson(signal_strength, actual_return). Above 0.05 = healthy. Below 0.02 = dead signal.

**PM momentum:** velocity = ΔP / Δt over 6h. Signal fires when |velocity| > 0.02/hr AND acceleration has same sign.

**PM divergence:** |Kalshi_prob − FedWatch_prob| > 10 percentage points.

**PM threshold:** probability crosses 50%, 70%, or 90% boundary.

---

*This document is a living reference. Update as the system evolves through paper trading and live deployment.*

*Blueprint v3.0 (prediction market layer added) | March 2026 | Fajrrr Studio*
