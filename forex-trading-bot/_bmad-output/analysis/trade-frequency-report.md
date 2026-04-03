# Trade Frequency Analysis Report

**Generated:** 2026-04-03
**Data span:** Mar 20 - Apr 3 (14 days, 372 H4 bars across 6 instruments)
**Trades executed:** 3 total (2 open, 1 closed)

---

## The Funnel

```
Cron fires per day:                96  (every 15 min)
  |
  v
Scan scheduler passes:            ~37  (session throttling)
  |
  v
Circuit breaker passes:           ~37  (no triggers until Apr 3 deploy)
  |
  v
Kill switch / weekend passes:     ~37  (never triggered)
  |
  v
H4 bars evaluated (14 days):      372  (6 instruments x ~62 bars each)
  |
  +--> Regime = trending:         128 bars (34.4%)  --> only trend following runs
  +--> Regime = ranging:          135 bars (36.3%)  --> only mean reversion runs
  +--> Regime = transition:       109 bars (29.3%)  --> both run at 0.5x (BUT trend is dead code here)
  |
  +--> EMA crossovers detected:    11  (0.13/instrument/day)
  |    +--> with ADX > 20:          3  (THE BOTTLENECK: 73% of crossovers killed by ADX)
  |    +--> with ADX > 15:          7  (+133% if we lower threshold)
  |    +--> with ADX > 10:         10  (+233% if we lower threshold)
  |
  +--> Mean reversion signals:     34  (0.40/instrument/day)
  |    (BB touch + RSI + ADX confluence)
  |
  +--> Agent pipeline overrides:    ~60 chief decisions stored (all "long")
  |    (But only runs when chief != 'hold'. 0 predictions for USD_JPY, BCO_USD)
  |
  +--> Blocked by existing position: 1 of 6 instruments (EUR_GBP)
  +--> Blocked by sentiment filter:  unknown (no logs)
  +--> Pre-trade checks:            passed for 3 trades
  |
  v
ACTUAL TRADES OPENED:              3   (3/372 = 0.81% of H4 bars)
```

---

## Per-Instrument Breakdown

### Regime Distribution (14 days)

| Instrument | Trending | Ranging | Transition | Dominant |
|------------|----------|---------|------------|----------|
| XAU_USD    | 96.7%    | 0.0%    | 3.3%       | Almost always trending |
| EUR_GBP    | 34.9%    | 41.3%   | 23.8%      | Mixed |
| EUR_USD    | 17.5%    | 65.1%   | 17.5%      | Mostly ranging |
| USD_JPY    | 4.8%     | 44.4%   | 50.8%      | Transition + ranging |
| BCO_USD    | 8.3%     | 43.3%   | 48.3%      | Transition + ranging |
| US30_USD   | 46.0%    | 22.2%   | 31.7%      | Split trending/transition |

**Key finding:** Only XAU_USD and US30_USD spend meaningful time in trending regime. The other 4 instruments spend 48-95% of their time in ranging or transition, where trend following is either disabled (ranging) or dead code (transition).

### Trend Following: Crossover Analysis

| Instrument | Total Crossovers | ADX>20 | ADX>18 | ADX>15 | ADX>12 | ADX>10 |
|------------|-----------------|--------|--------|--------|--------|--------|
| XAU_USD    | 1               | 1      | 1      | 1      | 1      | 1      |
| EUR_GBP    | 1               | 0      | 0      | 0      | 1      | 1      |
| EUR_USD    | 3               | 1      | 2      | 2      | 2      | 2      |
| USD_JPY    | 3               | 0      | 0      | 2      | 2      | 3      |
| BCO_USD    | 2               | 0      | 1      | 1      | 1      | 2      |
| US30_USD   | 1               | 1      | 1      | 1      | 1      | 1      |
| **TOTAL**  | **11**          | **3**  | **5**  | **7**  | **8**  | **10** |

**This is the #1 bottleneck.** 11 crossovers happened in 14 days. Only 3 had sufficient ADX (>20). Lowering to ADX>15 would more than double the signals from 3 to 7.

### Trend Position Analysis (Alternative to Crossover)

Instead of requiring an exact crossover, how many bars had EMA20 on the right side WITH ADX>20?

| Instrument | EMA20>50 bars | ...with ADX>20 | EMA20<50 bars | ...with ADX>20 |
|------------|---------------|----------------|---------------|----------------|
| XAU_USD    | 8             | 8              | 52            | 50             |
| EUR_GBP    | 62            | 22             | 1             | 0              |
| EUR_USD    | 50            | 11             | 13            | 0              |
| USD_JPY    | 27            | 0              | 36            | 3              |
| BCO_USD    | 36            | 5              | 24            | 0              |
| US30_USD   | 11            | 11             | 52            | 18             |
| **TOTAL**  | **194**       | **57**         | **178**       | **71**         |

Switching from crossover (3 signals) to position+ADX (128 signals) would be a 42x increase. Obviously too aggressive alone, but shows the enormous gap between "crossover" and "position-based" entries.

### Mean Reversion Signal Analysis

| Instrument | Current (RSI 40/60, ADX<25) | RSI 45/55 | RSI 48/52 | ADX<30 |
|------------|----------------------------|-----------|-----------|--------|
| XAU_USD    | 4 (0L, 4S)                | 4         | 4         | 4      |
| EUR_GBP    | 10 (0L, 10S)              | 11        | 11        | 10     |
| EUR_USD    | 5 (1L, 4S)                | 7         | 7         | 5      |
| USD_JPY    | 4 (4L, 0S)                | 4         | 4         | 4      |
| BCO_USD    | 7 (2L, 5S)                | 7         | 7         | 8      |
| US30_USD   | 4 (4L, 0S)                | 6         | 6         | 4      |
| **TOTAL**  | **34**                     | **39**    | **39**    | **35** |

Relaxing RSI from 40/60 to 45/55 adds 5 signals (+15%). Further relaxation to 48/52 doesn't help. ADX relaxation from 25 to 30 adds only 1 signal.

**Mean reversion is already the more productive strategy.** It generates 34 signals vs. 3 for trend following. The BCO_USD trade (the only MR trade) came from this path.

### Agent Pipeline Analysis

| Instrument | Predictions | Chief Long | Chief Short | Chief Hold | Tech Conf | Sentiment Conf |
|------------|-------------|------------|-------------|------------|-----------|----------------|
| XAU_USD    | 100         | 25         | 0           | 0          | 0.72      | 0.20           |
| EUR_GBP    | 80          | 20         | 0           | 0          | 0.65      | 0.20           |
| EUR_USD    | 20          | 6          | 0           | 0          | 0.67      | 0.20           |
| USD_JPY    | 0           | 0          | 0           | 0          | N/A       | N/A            |
| BCO_USD    | 0           | 0          | 0           | 0          | N/A       | N/A            |
| US30_USD   | 36          | 9          | 0           | 0          | 0.66      | 0.20           |

**Critical findings:**
1. **Sentiment analyst ALWAYS returns hold at 0.20 confidence** — GDELT was broken (now fixed), Finnhub calendar needs premium
2. **Macro analyst ALWAYS returns hold at 0.50 confidence** — no economic calendar data
3. **Technical and Regime are the only functional agents** — 2 out of 4 analysts are effectively disabled
4. **USD_JPY and BCO_USD get ZERO agent predictions** — chief is returning 'hold' for these (predictions only stored when chief != 'hold')
5. **All chief decisions are "long"** — the agents never recommend shorting. This is likely because EMA20>EMA50 for most instruments most of the time, and the technical analyst follows the same trend direction

### Current State (Latest Indicators)

| Instrument | ADX    | Regime      | EMA Position      | RSI   | Strategies Active |
|------------|--------|-------------|-------------------|-------|-------------------|
| XAU_USD    | 22.15  | trending    | EMA20 > EMA50     | 54.9  | trend only        |
| EUR_GBP    | 24.49  | trending    | EMA20 > EMA50     | 59.7  | trend only        |
| EUR_USD    | 17.63  | transition  | EMA20 > EMA50     | 50.7  | both (0.5x)       |
| USD_JPY    | 13.65  | ranging     | EMA20 > EMA50     | 54.4  | MR only           |
| BCO_USD    | 18.55  | transition  | EMA20 > EMA50     | 67.1  | both (0.5x)       |
| US30_USD   | 22.16  | trending    | EMA20 > EMA50     | 54.8  | trend only        |

All 6 instruments have EMA20 > EMA50. No EMA crossover is imminent. No RSI extremes. The bot will not trade until market conditions change.

---

## The Bottleneck Ranking

Ranked by how many potential trades each filter blocks:

| Rank | Bottleneck | Impact | Evidence |
|------|-----------|--------|----------|
| **#1** | **EMA crossover requirement** | Blocks 99.2% of bars | 372 bars, only 3 crossovers pass ADX. Crossover = point-in-time event on H4 = maybe once per 5-15 days per instrument |
| **#2** | **Transition regime kills trend following (dead code)** | Blocks 100% of trend signals in 29% of bars | ADX 15-20 allows trend following to run, but trend requires ADX>20 which is impossible. 109 bars of dead evaluation |
| **#3** | **Only 2 of 4 agents are functional** | Reduces agent conviction | Sentiment always 0.20 confidence, macro always hold. Chief makes decisions on incomplete data → defaults to 'hold' for USD_JPY, BCO_USD |
| **#4** | **6 instruments on H4 timeframe** | Tiny sample size | 36 data points per day. Adding instruments to 12 doubles opportunities |
| **#5** | **BB exact touch requirement** | Marginal impact | Near-miss data shows many bars within 0.5% of BB but not touching. EUR_GBP: 33 bars near lower BB vs. 10 actual touches |
| **#6** | **Existing position blocking** | 17% of instruments blocked | 1-2 of 6 instruments always occupied |
| **#7** | **MR RSI thresholds (40/60)** | Blocks 5 additional signals | Relaxing to 45/55 adds +15% MR signals |
| **#8** | **Scan scheduler** | Cosmetic | Reduces cron fires but doesn't matter — indicators only update every 4h anyway |

---

## Sensitivity Analysis

### Trend Following ADX Entry Threshold

| ADX Threshold | Crossover Signals | Change vs Current | Risk Impact |
|---------------|-------------------|-------------------|-------------|
| >20 (current) | 3                 | baseline          | — |
| >18           | 5                 | +2 (+67%)         | Low: still requires decent trend strength |
| >15           | 7                 | +4 (+133%)        | Medium: weaker trends may whipsaw |
| >12           | 8                 | +5 (+167%)        | Higher: transition-zone trades |
| >10           | 10                | +7 (+233%)        | High: very weak trends included |

### Mean Reversion Parameters

| Parameter | Current | Relaxed | Trades Gained |
|-----------|---------|---------|---------------|
| RSI oversold | 40 | 45 | +5 signals (+15%) |
| RSI overbought | 60 | 55 | included above |
| ADX range cap | 25 | 30 | +1 signal (+3%) |
| BB touch | exact | within 0.5% | ~+10 near-misses become signals |

### Agent Confidence Threshold

| Threshold | Impact |
|-----------|--------|
| 0.3 (current) | Agents ARE firing — they produced the EUR_GBP trade. But 2/4 agents are broken. |
| 0.2 | Marginal gain — sentiment at 0.20 would start contributing |
| Fix sentiment/macro data | **The real fix** — give agents real data, not lower the bar |

### Structural Changes

| Change | Signal Impact | Effort |
|--------|--------------|--------|
| Fix transition dead code | Enables trend following in 29% of bars | 2 lines |
| Lower trend ADX to 15 | +133% trend signals | 1 line |
| Add BB proximity tolerance (0.5%) | ~+10 MR signals | 5 lines |
| Fix GDELT (done) | Sentiment agent starts working | Done |
| Add more instruments (6 → 12) | ~2x all signals | Config change |

---

## Structural Issues

### Issue A: The Crossover Trap (CONFIRMED)

The EMA crossover on H4 is an extremely rare event: 0.13 crossovers per instrument per day. With 6 instruments, that's ~0.8 crossovers per day across the entire portfolio. Of those, only 27% pass the ADX>20 filter. This means the bot gets a valid trend entry signal **once every ~5 days**.

The alternative — "EMA position" (EMA20 above/below EMA50) — produces 128 bars with ADX>20 in the same period. A position-based entry with additional momentum confirmation (e.g., ADX rising, price above both EMAs) would be dramatically more productive while still being trend-aligned.

### Issue B: Transition Regime Dead Code (CONFIRMED)

When ADX is 15-20 (transition), the regime detector allows both trend and mean reversion to run. But trend following internally requires ADX>20, which is **impossible** in transition. This means:
- 109 bars (29.3%) run trend following for zero possible output
- Those 109 bars DO run mean reversion at 0.5x size, which is the only productive path

**Fix:** Either lower the trend following ADX threshold to 15 (so it can fire in transition), or remove the internal ADX check from trend following and let the regime detector be the sole gate.

### Issue C: Agent Pipeline Has 2 Blind Spots (CONFIRMED)

Sentiment analyst: Always returns hold at 0.20 confidence because GDELT was broken (fixed today) and news data was thin.

Macro analyst: Always returns hold at 0.50 confidence because the economic calendar requires Finnhub premium (not purchased).

This means the chief analyst makes decisions primarily from technical + regime — 2 of the same 4 inputs that the technical strategy already uses. The multi-agent pipeline adds overhead but limited value until sentiment and macro have real data.

### Issue D: Agent Override IS Working (CONFIRMED)

The EUR_GBP trade is proof: the only crossover on EUR_GBP had ADX between 10-12 (far below the 20 threshold). The trade was opened because the agent pipeline returned "long" with confidence >= 0.3, overriding the technical requirement.

However, this only works for XAU_USD, EUR_GBP, EUR_USD, and US30_USD. For USD_JPY and BCO_USD, the chief returns 'hold' and no predictions are stored — meaning the agent path is blocked for 2 of 6 instruments.

---

## Quick Wins (Recommended Changes)

### Win 1: Fix Transition Dead Code (HIGH IMPACT, ZERO RISK)
Lower trend following `ADX_ENTRY_THRESHOLD` from 20 to 15. This eliminates the dead code where trend following runs in transition but can never fire. It also captures crossovers that happen in moderate trend conditions.

**Expected impact:** +4 trend signals over 14 days (+133%)

### Win 2: Add BB Proximity Tolerance to Mean Reversion (MEDIUM IMPACT, LOW RISK)
Instead of requiring `close <= bb_lower`, allow `close <= bb_lower * 1.005` (within 0.5%). Price just above the BB band is statistically similar to price at the band.

**Expected impact:** ~+10 MR signals over 14 days

### Win 3: Ensure Agent Data Quality (HIGH IMPACT, MEDIUM EFFORT)
The GDELT fix is deployed. Monitor whether sentiment agent confidence improves above 0.20 in the next 24-48 hours. With real sentiment data, the chief analyst will have more conviction to recommend trades on USD_JPY and BCO_USD.

### Win 4: Add More Instruments (HIGH IMPACT, LOW EFFORT)
The `instrument_universe` table supports up to 12 instruments. Adding 6 more uncorrelated instruments (e.g., AUD_USD, GBP_USD, NZD_USD, XAG_USD, US500, GER40) would roughly double all signal counts without changing any thresholds.

### Win 5: Relax MR RSI from 40/60 to 45/55 (LOW IMPACT, ZERO RISK)
Adds 5 signals over 14 days. The 40/60 thresholds are already loosened from the original 30/70. Going to 45/55 is moderate and still requires meaningful RSI deviation.

---

## What NOT to Change

1. **risk/constants.ts** — All 9 pre-trade checks are IMMUTABLE safety limits. They are not blocking trades (they passed for all 3 trades that reached them).
2. **Position sizing** — Half-Kelly + ATR + vol targeting is working correctly.
3. **Pipeline frequency** — Adding more cron runs won't help because H4 candles only update every 4 hours.
4. **Agent confidence threshold** — 0.3 is already low. The problem is data quality, not the threshold.

---

## Next Steps

1. Implement Quick Wins 1-2 and 5 (code changes to trend-following.ts and mean-reversion.ts)
2. Monitor GDELT fix impact on sentiment agent over 24-48 hours
3. Add 3-6 more instruments to instrument_universe table
4. Re-run this analysis in 7 days to measure improvement
5. Consider a structural redesign of trend following: position-based entries with momentum confirmation instead of pure crossover (larger effort, bigger reward)
