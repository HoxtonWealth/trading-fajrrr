import { NextResponse } from 'next/server'
import { getAccountSummary } from '@/lib/services/capital'
import { supabase } from '@/lib/services/supabase'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Fetch account summary from OANDA
    const account = await getAccountSummary()
    const equity = parseFloat(account.NAV)
    const balance = parseFloat(account.balance)
    const unrealizedPnl = parseFloat(account.unrealizedPL)
    const openPositions = account.openTradeCount

    // 2. Get peak equity (highest equity since last drawdown reset)
    const { data: resetState } = await supabase
      .from('system_state')
      .select('value')
      .eq('key', 'drawdown_reset_at')
      .single()

    let peakQuery = supabase
      .from('equity_snapshots')
      .select('equity')
      .order('equity', { ascending: false })
      .limit(1)

    // If drawdown was reset, only look at snapshots after the reset
    if (resetState?.value) {
      peakQuery = peakQuery.gte('created_at', resetState.value)
    }

    const { data: peakRow } = await peakQuery.single()
    const peakEquity = peakRow ? Math.max(peakRow.equity, equity) : equity

    // 3. Compute drawdown
    const drawdownPercent = peakEquity > 0
      ? ((peakEquity - equity) / peakEquity) * 100
      : 0

    // 4. Compute daily P&L (vs first snapshot of today)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { data: todayFirstSnapshot } = await supabase
      .from('equity_snapshots')
      .select('equity')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    const dailyPnl = todayFirstSnapshot
      ? equity - todayFirstSnapshot.equity
      : 0

    // 5. Insert snapshot
    const { error } = await supabase
      .from('equity_snapshots')
      .insert({
        equity,
        balance,
        unrealized_pnl: unrealizedPnl,
        open_positions: openPositions,
        daily_pnl: dailyPnl,
        drawdown_percent: Math.max(0, drawdownPercent),
      })

    if (error) {
      throw new Error(`Equity snapshot insert failed: ${error.message}`)
    }

    const pnlWord = dailyPnl >= 0 ? 'up' : 'down'
    const msg = `Account at $${equity.toFixed(0)} (${pnlWord} $${Math.abs(dailyPnl).toFixed(0)} today). ${openPositions} open position${openPositions !== 1 ? 's' : ''}. Drawdown: ${drawdownPercent.toFixed(1)}%.`
    await logCron('ingest-equity', msg)

    return NextResponse.json({
      success: true,
      summary: `Equity: $${equity.toFixed(2)}, Drawdown: ${drawdownPercent.toFixed(2)}%, Daily P&L: $${dailyPnl.toFixed(2)}`,
    })
  } catch (error) {
    await logCron('ingest-equity', `Failed to check account: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/ingest-equity] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
