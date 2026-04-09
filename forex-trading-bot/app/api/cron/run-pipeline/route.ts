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

  // --- Safety operations run ALWAYS, regardless of scan scheduler ---

  // --- Step 1: Position reconciliation — sync broker state before any decisions ---
  try {
    const { reconcilePositions } = await import('@/lib/risk/position-reconciler')
    const reconciliation = await reconcilePositions()

    if (reconciliation.brokerClosed.length > 0 || reconciliation.orphaned.length > 0) {
      const parts: string[] = []
      if (reconciliation.brokerClosed.length > 0) {
        parts.push(`${reconciliation.brokerClosed.length} position(s) closed by broker`)
      }
      if (reconciliation.orphaned.length > 0) {
        parts.push(`${reconciliation.orphaned.length} orphaned record(s) cleaned up`)
      }
      await logCron('run-pipeline', `Reconciliation: ${parts.join(', ')}. ${reconciliation.matched} position(s) verified.`)
    }
  } catch (reconErr) {
    console.error('[cron/run-pipeline] Reconciliation failed:', reconErr)
    // Non-fatal: continue with pipeline
  }

  // --- Step 2: Stop loss verification — ensure all positions have stops ---
  try {
    const { verifyStopLosses } = await import('@/lib/risk/stop-loss-verifier')
    const stopResult = await verifyStopLosses()

    if (stopResult.fixed.length > 0 || stopResult.errors.length > 0) {
      const parts: string[] = []
      if (stopResult.fixed.length > 0) {
        parts.push(`FIXED ${stopResult.fixed.length} missing stop(s): ${stopResult.fixed.map(f => `${f.instrument} @ ${f.stopSet.toFixed(4)}`).join(', ')}`)
      }
      if (stopResult.errors.length > 0) {
        parts.push(`FAILED to fix ${stopResult.errors.length} stop(s)`)
      }
      await logCron('run-pipeline', `Stop verification: ${parts.join('. ')}`)
    }
  } catch (stopErr) {
    console.error('[cron/run-pipeline] Stop verification failed:', stopErr)
  }

  // --- Step 3: Circuit breakers — graduated response ---
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
        // Graduated circuit breaker — close dangerous positions, tighten the rest
        let cbSummary = 'Graduated response FAILED — could not execute.'
        try {
          const { executeCircuitBreakerResponse } = await import('@/lib/risk/circuit-breaker-response')
          const cbResult = await executeCircuitBreakerResponse(latestEquity.equity)
          cbSummary = `Closed ${cbResult.positionsClosed} position(s), tightened ${cbResult.stopsTightened} stop(s), kept ${cbResult.positionsKept} position(s).`
          if (cbResult.errors.length > 0) {
            cbSummary += ` Errors: ${cbResult.errors.length}.`
          }
        } catch (cbErr) {
          console.error('[cron/run-pipeline] Circuit breaker response failed:', cbErr)
        }

        const msg = `CIRCUIT BREAKER: Drawdown at ${latestEquity.drawdown_percent.toFixed(1)}% exceeds ${(MAX_DRAWDOWN * 100).toFixed(0)}% limit. ${cbSummary} New trading halted.`
        await logCron('run-pipeline', msg, false)
        alertCircuitBreaker(
          `Drawdown ${latestEquity.drawdown_percent.toFixed(1)}% > ${(MAX_DRAWDOWN * 100).toFixed(0)}% max`,
          cbSummary
        ).catch(() => {})
        return NextResponse.json({ success: true, halted: true, reason: msg })
      }

      if (latestEquity.daily_pnl < 0) {
        const dailyLossPercent = Math.abs(latestEquity.daily_pnl) / latestEquity.equity
        if (dailyLossPercent >= MAX_DAILY_LOSS) {
          // Daily loss — tighten all stops to 1x ATR before halting
          let tightenSummary = ''
          try {
            const { executeDailyLossResponse } = await import('@/lib/risk/circuit-breaker-response')
            const dlResult = await executeDailyLossResponse()
            tightenSummary = dlResult.stopsTightened > 0
              ? `Tightened ${dlResult.stopsTightened} stop(s) to 1x ATR.`
              : ''
          } catch (dlErr) {
            console.error('[cron/run-pipeline] Daily loss stop tightening failed:', dlErr)
          }

          const msg = `DAILY LOSS LIMIT: Down ${(dailyLossPercent * 100).toFixed(1)}% today, exceeds ${(MAX_DAILY_LOSS * 100).toFixed(0)}% limit. ${tightenSummary} Trading halted for today.`
          await logCron('run-pipeline', msg, false)
          alertCircuitBreaker(
            `Daily loss ${(dailyLossPercent * 100).toFixed(1)}% > ${(MAX_DAILY_LOSS * 100).toFixed(0)}% max`,
            `Pipeline halted for today. ${tightenSummary}`
          ).catch(() => {})
          return NextResponse.json({ success: true, halted: true, reason: msg })
        }
      }
    }
  } catch (cbError) {
    console.error('[cron/run-pipeline] Circuit breaker check failed:', cbError)
  }

  // --- Step 4: Run trading pipeline (scan scheduler gates only this part) ---
  const url = new URL(request.url)
  const forceRun = url.searchParams.get('force') === 'true'
  if (!forceRun) {
    const shouldRun = await shouldRunNow('run-pipeline')
    if (!shouldRun) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Scan scheduler: not time to trade. Safety checks completed.' })
    }
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
