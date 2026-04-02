import { NextResponse } from 'next/server'
import { runPipeline, PipelineResult } from '@/lib/pipeline'
import { logCron } from '@/lib/services/cron-logger'
import { getActiveInstruments, getFriendlyNames } from '@/lib/instruments'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const INSTRUMENTS = await getActiveInstruments()
  const FRIENDLY_NAMES = await getFriendlyNames()

  try {
    const results: PipelineResult[] = []

    for (const instrument of INSTRUMENTS) {
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
