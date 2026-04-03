import { NextResponse } from 'next/server'
import { runPipeline, PipelineResult } from '@/lib/pipeline'
import { logCron } from '@/lib/services/cron-logger'
import { getActiveInstruments, getFriendlyNames } from '@/lib/instruments'
import { screenInstruments } from '@/lib/intelligence/screener'
import { shouldRunNow } from '@/lib/intelligence/scan-scheduler'
import { supabase } from '@/lib/services/supabase'
import { MAX_DRAWDOWN, MAX_DAILY_LOSS } from '@/lib/risk/constants'
import { alertCircuitBreaker } from '@/lib/services/telegram'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Scan scheduler — skip if current session doesn't need this cron now
  const shouldRun = await shouldRunNow('run-pipeline')
  if (!shouldRun) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Scan scheduler: not time to run in current session' })
  }

  // Circuit breakers — halt if drawdown or daily loss exceeds limits
  try {
    const { data: latestEquity } = await supabase
      .from('equity_snapshots')
      .select('equity, drawdown_percent, daily_pnl')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestEquity && latestEquity.equity > 0) {
      const drawdownDecimal = latestEquity.drawdown_percent / 100

      if (drawdownDecimal >= MAX_DRAWDOWN) {
        const msg = `CIRCUIT BREAKER: Drawdown at ${latestEquity.drawdown_percent.toFixed(1)}% exceeds ${(MAX_DRAWDOWN * 100).toFixed(0)}% limit. All trading halted.`
        await logCron('run-pipeline', msg, false)
        alertCircuitBreaker(
          `Drawdown ${latestEquity.drawdown_percent.toFixed(1)}% > ${(MAX_DRAWDOWN * 100).toFixed(0)}% max`,
          'Pipeline halted — no new trades until drawdown recovers'
        ).catch(() => {})
        return NextResponse.json({ success: true, halted: true, reason: msg })
      }

      if (latestEquity.daily_pnl < 0) {
        const dailyLossPercent = Math.abs(latestEquity.daily_pnl) / latestEquity.equity
        if (dailyLossPercent >= MAX_DAILY_LOSS) {
          const msg = `DAILY LOSS LIMIT: Down ${(dailyLossPercent * 100).toFixed(1)}% today, exceeds ${(MAX_DAILY_LOSS * 100).toFixed(0)}% limit. Trading halted for today.`
          await logCron('run-pipeline', msg, false)
          alertCircuitBreaker(
            `Daily loss ${(dailyLossPercent * 100).toFixed(1)}% > ${(MAX_DAILY_LOSS * 100).toFixed(0)}% max`,
            'Pipeline halted for today — will resume tomorrow'
          ).catch(() => {})
          return NextResponse.json({ success: true, halted: true, reason: msg })
        }
      }
    }
  } catch (cbError) {
    console.error('[cron/run-pipeline] Circuit breaker check failed:', cbError)
  }

  const INSTRUMENTS = await getActiveInstruments()
  const FRIENDLY_NAMES = await getFriendlyNames()

  // Screen instruments — prioritize top opportunities
  let instrumentsToTrade = INSTRUMENTS
  try {
    const screened = await screenInstruments(INSTRUMENTS, 6)
    if (screened.length > 0) {
      instrumentsToTrade = screened.map(s => s.instrument)
    }
  } catch (screenErr) {
    console.error('[cron/run-pipeline] Screener failed, using all instruments:', screenErr)
  }

  try {
    const results: PipelineResult[] = []

    for (const instrument of instrumentsToTrade) {
      try {
        const result = await runPipeline(instrument)
        results.push(result)
      } catch (error) {
        console.error(`[cron/run-pipeline] Error for ${instrument}:`, error)
        results.push({
          action: 'none',
          instrument,
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    // Build human-readable summary
    const lines: string[] = []
    const trades = results.filter(r => r.action === 'open_trade')
    const closes = results.filter(r => r.action === 'close_trade')
    const skipped = results.filter(r => r.action === 'none')

    if (trades.length > 0) {
      for (const t of trades) {
        const name = FRIENDLY_NAMES[t.instrument] ?? t.instrument
        const dir = t.trade?.direction === 'long' ? 'bought' : 'sold'
        lines.push(`Opened trade: ${dir} ${name} (${t.trade?.units} units, stop at ${t.trade?.stop_loss?.toFixed(2)}).`)
      }
    }

    if (closes.length > 0) {
      for (const c of closes) {
        const name = FRIENDLY_NAMES[c.instrument] ?? c.instrument
        lines.push(`Closed ${name} position — reason: ${c.details.split(': ').pop()}.`)
      }
    }

    if (trades.length === 0 && closes.length === 0) {
      // Summarize why nothing happened
      const regimes = skipped.map(r => {
        const name = FRIENDLY_NAMES[r.instrument] ?? r.instrument
        if (r.details.includes('ranging')) return `${name} (quiet market)`
        if (r.details.includes('transition')) return `${name} (unclear trend)`
        if (r.details.includes('No signal')) return `${name} (no signal)`
        if (r.details.includes('Already have')) return `${name} (already in a trade)`
        if (r.details.includes('Weekend')) return `${name} (weekend pause)`
        return `${name} (waiting)`
      })
      lines.push(`Looked at all ${INSTRUMENTS.length} markets, no new trades. ${regimes.join(', ')}.`)
    }

    const msg = lines.join(' ')
    await logCron('run-pipeline', msg)

    return NextResponse.json({ success: true, results })
  } catch (error) {
    await logCron('run-pipeline', `Pipeline failed: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/run-pipeline] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
