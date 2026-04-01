import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { alertCustom } from '@/lib/services/telegram'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Trades summary
    const { data: trades } = await supabase
      .from('trades')
      .select('instrument, direction, strategy, pnl')
      .eq('status', 'closed')
      .not('pnl', 'is', null)
      .gte('closed_at', thirtyDaysAgo)

    const totalTrades = trades?.length ?? 0
    const wins = trades?.filter(t => t.pnl > 0).length ?? 0
    const totalPnl = trades?.reduce((s, t) => s + (t.pnl ?? 0), 0) ?? 0
    const winRate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : '0'

    // Sharpe
    const returns = trades?.map(t => t.pnl ?? 0) ?? []
    const avgReturn = returns.length > 0 ? returns.reduce((s, v) => s + v, 0) / returns.length : 0
    const stdDev = returns.length > 1
      ? Math.sqrt(returns.reduce((s, v) => s + (v - avgReturn) ** 2, 0) / returns.length)
      : 0
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0

    // Current equity & drawdown
    const { data: latestEquity } = await supabase
      .from('equity_snapshots')
      .select('equity, drawdown_percent')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Best & worst trades
    const sorted = [...(trades ?? [])].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]

    // Per-instrument breakdown
    const byInstrument = new Map<string, { trades: number; pnl: number }>()
    for (const t of trades ?? []) {
      const entry = byInstrument.get(t.instrument) ?? { trades: 0, pnl: 0 }
      entry.trades++
      entry.pnl += t.pnl ?? 0
      byInstrument.set(t.instrument, entry)
    }

    const instrumentBreakdown = [...byInstrument.entries()]
      .map(([inst, s]) => `${inst}: ${s.trades} trades, $${s.pnl.toFixed(2)}`)
      .join('\n')

    const report = `📊 <b>Monthly Performance Report</b>

<b>Summary (30 days)</b>
Total Trades: ${totalTrades}
Win Rate: ${winRate}%
Total P&L: $${totalPnl.toFixed(2)}
Sharpe Ratio: ${sharpe.toFixed(3)}
Current Equity: $${latestEquity?.equity?.toFixed(2) ?? 'N/A'}
Drawdown: ${latestEquity?.drawdown_percent?.toFixed(2) ?? '0'}%

<b>Best Trade:</b> ${best ? `${best.instrument} ${best.direction} +$${best.pnl.toFixed(2)}` : 'N/A'}
<b>Worst Trade:</b> ${worst ? `${worst.instrument} ${worst.direction} $${worst.pnl.toFixed(2)}` : 'N/A'}

<b>Per Instrument:</b>
${instrumentBreakdown || 'No data'}`

    await alertCustom('Monthly Report', report)

    const pnlWord = totalPnl >= 0 ? 'profit' : 'loss'
    const msg = `Monthly report: ${totalTrades} trades, ${winRate}% win rate, $${Math.abs(totalPnl).toFixed(0)} ${pnlWord}. Sharpe: ${sharpe.toFixed(2)}.`
    await logCron('monthly-report', msg)

    return NextResponse.json({ success: true, summary: report })
  } catch (error) {
    await logCron('monthly-report', `Failed to generate: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/monthly-report] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
