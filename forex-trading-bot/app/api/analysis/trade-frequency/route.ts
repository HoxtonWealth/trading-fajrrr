import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { evaluateTrendFollowing, IndicatorSnapshot } from '@/lib/strategies/trend-following'
import { evaluateMeanReversion, MeanRevSnapshot } from '@/lib/strategies/mean-reversion'
import { detectRegime } from '@/lib/strategies/regime-detector'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // ============================================================
  // SECTION 1A: Pipeline Execution Frequency
  // ============================================================
  const { data: pipelineLogs } = await supabase
    .from('cron_logs')
    .select('cron_name, summary, success, created_at')
    .eq('cron_name', 'run-pipeline')
    .order('created_at', { ascending: false })
    .limit(50)

  const pipelineRunCount = pipelineLogs?.length ?? 0
  const blockedByKillSwitch = pipelineLogs?.filter(l =>
    l.summary.toLowerCase().includes('kill switch')
  ).length ?? 0
  const blockedByWeekend = pipelineLogs?.filter(l =>
    l.summary.toLowerCase().includes('weekend')
  ).length ?? 0
  const blockedByCircuitBreaker = pipelineLogs?.filter(l =>
    l.summary.toLowerCase().includes('circuit breaker') ||
    l.summary.toLowerCase().includes('daily loss limit')
  ).length ?? 0
  const noTradeRuns = pipelineLogs?.filter(l =>
    l.summary.toLowerCase().includes('no new trades')
  ).length ?? 0
  const tradeRuns = pipelineLogs?.filter(l =>
    l.summary.toLowerCase().includes('opened trade') ||
    l.summary.toLowerCase().includes('closed')
  ).length ?? 0

  results.pipelineExecution = {
    totalLoggedRuns: pipelineRunCount,
    blockedByKillSwitch,
    blockedByWeekend,
    blockedByCircuitBreaker,
    noTradeRuns,
    runsWithTrades: tradeRuns,
    recentLogs: pipelineLogs?.slice(0, 10).map(l => ({
      time: l.created_at,
      summary: l.summary,
      success: l.success,
    })),
  }

  // ============================================================
  // SECTION 1B: Trade History
  // ============================================================
  const { data: allTrades } = await supabase
    .from('trades')
    .select('id, instrument, direction, strategy, status, entry_price, pnl, opened_at, closed_at, close_reason')
    .order('opened_at', { ascending: false })

  const trades = allTrades ?? []
  const tradesByInstrument: Record<string, number> = {}
  const tradesByStrategy: Record<string, number> = {}
  for (const t of trades) {
    tradesByInstrument[t.instrument] = (tradesByInstrument[t.instrument] ?? 0) + 1
    tradesByStrategy[t.strategy] = (tradesByStrategy[t.strategy] ?? 0) + 1
  }

  results.tradeHistory = {
    totalTrades: trades.length,
    openTrades: trades.filter(t => t.status === 'open').length,
    closedTrades: trades.filter(t => t.status === 'closed').length,
    byInstrument: tradesByInstrument,
    byStrategy: tradesByStrategy,
    trades: trades.map(t => ({
      instrument: t.instrument,
      direction: t.direction,
      strategy: t.strategy,
      status: t.status,
      entryPrice: t.entry_price,
      pnl: t.pnl,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
      closeReason: t.close_reason,
    })),
  }

  // ============================================================
  // SECTION 1C: Indicator Data Availability
  // ============================================================
  const instruments = ['XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD']
  const indicatorAvailability: Record<string, unknown> = {}

  for (const inst of instruments) {
    const { count } = await supabase
      .from('indicators')
      .select('*', { count: 'exact', head: true })
      .eq('instrument', inst)
      .eq('granularity', 'H4')

    const { data: latestRow } = await supabase
      .from('indicators')
      .select('time, ema_20, ema_50, adx_14, atr_14, rsi_14, bb_upper, bb_lower')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: false })
      .limit(1)
      .single()

    const { data: oldestRow } = await supabase
      .from('indicators')
      .select('time')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: true })
      .limit(1)
      .single()

    indicatorAvailability[inst] = {
      totalRows: count,
      oldestData: oldestRow?.time,
      latestData: latestRow?.time,
      latestValues: latestRow ? {
        ema_20: latestRow.ema_20,
        ema_50: latestRow.ema_50,
        adx_14: latestRow.adx_14,
        atr_14: latestRow.atr_14,
        rsi_14: latestRow.rsi_14,
        bb_upper: latestRow.bb_upper,
        bb_lower: latestRow.bb_lower,
      } : null,
    }
  }

  results.indicatorAvailability = indicatorAvailability

  // ============================================================
  // SECTION 1D: Regime Detection + Signal Simulation
  // ============================================================
  const signalAnalysis: Record<string, unknown> = {}

  for (const inst of instruments) {
    const { data: allIndicators } = await supabase
      .from('indicators')
      .select('time, ema_20, ema_50, adx_14, atr_14, rsi_14, bb_upper, bb_middle, bb_lower')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: true })

    if (!allIndicators || allIndicators.length < 2) {
      signalAnalysis[inst] = { error: 'Not enough data', rows: allIndicators?.length ?? 0 }
      continue
    }

    // Get candle close prices for BB touch analysis
    const { data: allCandles } = await supabase
      .from('candles')
      .select('time, close')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: true })

    // Build a close price map by time
    const closePriceMap: Record<string, number> = {}
    for (const c of allCandles ?? []) {
      closePriceMap[c.time] = c.close
    }

    let trending = 0, ranging = 0, transition = 0
    let emaCrossUps = 0, emaCrossDowns = 0
    let crossWithAdx20 = 0, crossWithAdx18 = 0, crossWithAdx15 = 0, crossWithAdx12 = 0, crossWithAdx10 = 0
    let mrLongSignals = 0, mrShortSignals = 0
    let mrLongRsi45 = 0, mrShortRsi55 = 0  // relaxed RSI
    let mrLongRsi48 = 0, mrShortRsi52 = 0  // very relaxed RSI
    let mrLongAdx30 = 0, mrShortAdx30 = 0  // relaxed ADX
    let bbNearLower01 = 0, bbNearUpper01 = 0  // within 0.1%
    let bbNearLower02 = 0, bbNearUpper02 = 0  // within 0.2%
    let bbNearLower05 = 0, bbNearUpper05 = 0  // within 0.5%

    // Trend position signals (EMA20 > EMA50, not just crossover)
    let emaPositionLong = 0, emaPositionShort = 0
    let emaPositionLongWithAdx20 = 0, emaPositionShortWithAdx20 = 0

    // Agent prediction data
    const { data: agentPredictions } = await supabase
      .from('trade_agent_predictions')
      .select('agent, predicted_signal, confidence, chief_decision, created_at')
      .eq('instrument', inst)
      .order('created_at', { ascending: false })
      .limit(100)

    const rows = allIndicators

    for (let i = 1; i < rows.length; i++) {
      const curr = rows[i]
      const prev = rows[i - 1]
      const close = closePriceMap[curr.time] ?? curr.ema_20

      // Regime classification
      const regime = detectRegime(curr.adx_14)
      if (regime.regime === 'trending') trending++
      else if (regime.regime === 'ranging') ranging++
      else transition++

      // EMA position (not crossover)
      if (curr.ema_20 > curr.ema_50) {
        emaPositionLong++
        if (curr.adx_14 > 20) emaPositionLongWithAdx20++
      } else {
        emaPositionShort++
        if (curr.adx_14 > 20) emaPositionShortWithAdx20++
      }

      // EMA crossover detection
      const emaLongNow = curr.ema_20 > curr.ema_50
      const emaLongPrev = prev.ema_20 > prev.ema_50
      const crossedAbove = emaLongNow && !emaLongPrev
      const crossedBelow = !emaLongNow && emaLongPrev

      if (crossedAbove) {
        emaCrossUps++
        if (curr.adx_14 > 20) crossWithAdx20++
        if (curr.adx_14 > 18) crossWithAdx18++
        if (curr.adx_14 > 15) crossWithAdx15++
        if (curr.adx_14 > 12) crossWithAdx12++
        if (curr.adx_14 > 10) crossWithAdx10++
      }
      if (crossedBelow) {
        emaCrossDowns++
        if (curr.adx_14 > 20) crossWithAdx20++
        if (curr.adx_14 > 18) crossWithAdx18++
        if (curr.adx_14 > 15) crossWithAdx15++
        if (curr.adx_14 > 12) crossWithAdx12++
        if (curr.adx_14 > 10) crossWithAdx10++
      }

      // Mean reversion simulation
      if (curr.rsi_14 != null && curr.bb_upper != null && curr.bb_lower != null && curr.bb_middle != null) {
        // Current thresholds
        if (close <= curr.bb_lower && curr.rsi_14 < 40 && curr.adx_14 < 25) mrLongSignals++
        if (close >= curr.bb_upper && curr.rsi_14 > 60 && curr.adx_14 < 25) mrShortSignals++

        // Relaxed RSI (45/55)
        if (close <= curr.bb_lower && curr.rsi_14 < 45 && curr.adx_14 < 25) mrLongRsi45++
        if (close >= curr.bb_upper && curr.rsi_14 > 55 && curr.adx_14 < 25) mrShortRsi55++

        // Very relaxed RSI (48/52)
        if (close <= curr.bb_lower && curr.rsi_14 < 48 && curr.adx_14 < 25) mrLongRsi48++
        if (close >= curr.bb_upper && curr.rsi_14 > 52 && curr.adx_14 < 25) mrShortRsi52++

        // Relaxed ADX (30)
        if (close <= curr.bb_lower && curr.rsi_14 < 40 && curr.adx_14 < 30) mrLongAdx30++
        if (close >= curr.bb_upper && curr.rsi_14 > 60 && curr.adx_14 < 30) mrShortAdx30++

        // BB proximity analysis (near but not touching)
        const bbRange = curr.bb_upper - curr.bb_lower
        if (bbRange > 0) {
          const distToLower = (close - curr.bb_lower) / bbRange
          const distToUpper = (curr.bb_upper - close) / bbRange

          if (distToLower <= 0.001) bbNearLower01++ // within 0.1% of BB range
          if (distToLower <= 0.002) bbNearLower02++
          if (distToLower <= 0.005) bbNearLower05++
          if (distToUpper <= 0.001) bbNearUpper01++
          if (distToUpper <= 0.002) bbNearUpper02++
          if (distToUpper <= 0.005) bbNearUpper05++

          // Proper percentage: within X% of BB band
          if (close > curr.bb_lower) {
            const pctAboveLower = (close - curr.bb_lower) / curr.bb_lower
            if (pctAboveLower <= 0.001) bbNearLower01++
            if (pctAboveLower <= 0.002) bbNearLower02++
            if (pctAboveLower <= 0.005) bbNearLower05++
          }
          if (close < curr.bb_upper) {
            const pctBelowUpper = (curr.bb_upper - close) / curr.bb_upper
            if (pctBelowUpper <= 0.001) bbNearUpper01++
            if (pctBelowUpper <= 0.002) bbNearUpper02++
            if (pctBelowUpper <= 0.005) bbNearUpper05++
          }
        }
      }
    }

    const totalBars = rows.length - 1

    signalAnalysis[inst] = {
      totalH4Bars: totalBars,
      dataSpan: { from: rows[0].time, to: rows[rows.length - 1].time },

      regime: {
        trending: trending,
        trendingPct: ((trending / totalBars) * 100).toFixed(1),
        ranging: ranging,
        rangingPct: ((ranging / totalBars) * 100).toFixed(1),
        transition: transition,
        transitionPct: ((transition / totalBars) * 100).toFixed(1),
      },

      trendFollowing: {
        emaCrossUps,
        emaCrossDowns,
        totalCrossovers: emaCrossUps + emaCrossDowns,
        crossoversPerDay: ((emaCrossUps + emaCrossDowns) / (totalBars / 6)).toFixed(2),
        crossWithCurrentAdx20: crossWithAdx20,
        crossWithAdx18: crossWithAdx18,
        crossWithAdx15: crossWithAdx15,
        crossWithAdx12: crossWithAdx12,
        crossWithAdx10: crossWithAdx10,
        note_deadCode: 'In transition regime (ADX 15-20), trend following requires ADX>20 which CANNOT fire',
      },

      trendPosition: {
        emaPositionLong,
        emaPositionShort,
        emaPositionLongWithAdx20,
        emaPositionShortWithAdx20,
        note: 'Bars where EMA20 is above/below EMA50 (NOT crossover, just position). Shows how many bars COULD have been entry opportunities with a position-based strategy.',
      },

      meanReversion: {
        currentThresholds: {
          longSignals: mrLongSignals,
          shortSignals: mrShortSignals,
          total: mrLongSignals + mrShortSignals,
        },
        relaxedRsi45_55: {
          longSignals: mrLongRsi45,
          shortSignals: mrShortRsi55,
          total: mrLongRsi45 + mrShortRsi55,
        },
        veryRelaxedRsi48_52: {
          longSignals: mrLongRsi48,
          shortSignals: mrShortRsi52,
          total: mrLongRsi48 + mrShortRsi52,
        },
        relaxedAdx30: {
          longSignals: mrLongAdx30,
          shortSignals: mrShortAdx30,
          total: mrLongAdx30 + mrShortAdx30,
        },
      },

      bbProximity: {
        note: 'Bars where price was NEAR the BB band but not touching — shows opportunities missed by exact-touch requirement',
        nearLower01pct: bbNearLower01,
        nearLower02pct: bbNearLower02,
        nearLower05pct: bbNearLower05,
        nearUpper01pct: bbNearUpper01,
        nearUpper02pct: bbNearUpper02,
        nearUpper05pct: bbNearUpper05,
      },

      agentPipeline: {
        totalPredictions: agentPredictions?.length ?? 0,
        byAgent: (() => {
          const byAgent: Record<string, { long: number; short: number; hold: number; avgConfidence: number }> = {}
          for (const p of agentPredictions ?? []) {
            if (!byAgent[p.agent]) byAgent[p.agent] = { long: 0, short: 0, hold: 0, avgConfidence: 0 }
            const a = byAgent[p.agent]
            if (p.predicted_signal === 'long') a.long++
            else if (p.predicted_signal === 'short') a.short++
            else a.hold++
            a.avgConfidence += p.confidence
          }
          for (const agent of Object.keys(byAgent)) {
            const total = byAgent[agent].long + byAgent[agent].short + byAgent[agent].hold
            byAgent[agent].avgConfidence = total > 0 ? byAgent[agent].avgConfidence / total : 0
          }
          return byAgent
        })(),
        chiefDecisions: (() => {
          const decisions: Record<string, number> = { long: 0, short: 0, hold: 0 }
          const seen = new Set<string>()
          for (const p of agentPredictions ?? []) {
            const key = `${p.created_at}-${p.chief_decision}`
            if (!seen.has(key)) {
              seen.add(key)
              decisions[p.chief_decision] = (decisions[p.chief_decision] ?? 0) + 1
            }
          }
          return decisions
        })(),
      },
    }
  }

  results.signalAnalysis = signalAnalysis

  // ============================================================
  // SECTION 1E: Latest Indicator Values + ADX Distribution
  // ============================================================
  const currentState: Record<string, unknown> = {}
  for (const inst of instruments) {
    const { data: latest } = await supabase
      .from('indicators')
      .select('time, adx_14, rsi_14, ema_20, ema_50')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: false })
      .limit(1)
      .single()

    const { data: latestCandle } = await supabase
      .from('candles')
      .select('close')
      .eq('instrument', inst)
      .eq('granularity', 'H4')
      .order('time', { ascending: false })
      .limit(1)
      .single()

    if (latest) {
      const regime = detectRegime(latest.adx_14)
      currentState[inst] = {
        adx: latest.adx_14,
        rsi: latest.rsi_14,
        ema20: latest.ema_20,
        ema50: latest.ema_50,
        close: latestCandle?.close,
        emaPosition: latest.ema_20 > latest.ema_50 ? 'EMA20 > EMA50 (bullish)' : 'EMA20 < EMA50 (bearish)',
        regime: regime.regime,
        strategiesAllowed: regime.strategies,
        sizeMultiplier: regime.sizeMultiplier,
        time: latest.time,
      }
    }
  }
  results.currentState = currentState

  // ============================================================
  // SECTION 1F: Equity & Drawdown History
  // ============================================================
  const { data: equityHistory } = await supabase
    .from('equity_snapshots')
    .select('equity, balance, drawdown_percent, daily_pnl, open_positions, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  results.equityHistory = equityHistory?.map(e => ({
    equity: e.equity,
    balance: e.balance,
    drawdown: e.drawdown_percent,
    dailyPnl: e.daily_pnl,
    openPositions: e.open_positions,
    time: e.created_at,
  }))

  // ============================================================
  // SUMMARY: The Funnel
  // ============================================================
  const totalSignals = Object.values(signalAnalysis).reduce((sum: number, inst: any) => {
    if (inst.error) return sum
    const tf = inst.trendFollowing?.crossWithCurrentAdx20 ?? 0
    const mr = inst.meanReversion?.currentThresholds?.total ?? 0
    return sum + tf + mr
  }, 0)

  const totalBarsAllInstruments = Object.values(signalAnalysis).reduce((sum: number, inst: any) => {
    return sum + (inst.totalH4Bars ?? 0)
  }, 0)

  const totalCrossovers = Object.values(signalAnalysis).reduce((sum: number, inst: any) => {
    return sum + (inst.trendFollowing?.totalCrossovers ?? 0)
  }, 0)

  results.funnelSummary = {
    totalH4BarsAnalyzed: totalBarsAllInstruments,
    totalCrossoversDetected: totalCrossovers,
    crossoversThatPassedAdx20: totalSignals,
    totalMrSignals: Object.values(signalAnalysis).reduce((sum, inst: any) => {
      return sum + (inst.meanReversion?.currentThresholds?.total ?? 0)
    }, 0),
    totalSignalsAtCurrentThresholds: totalSignals,
    actualTradesOpened: trades.length,
    conversionRate: totalBarsAllInstruments > 0
      ? `${((trades.length / totalBarsAllInstruments) * 100).toFixed(4)}%`
      : 'N/A',
  }

  return NextResponse.json(results, { status: 200 })
}
