import { NextResponse } from 'next/server'
import { getAccountSummary } from '@/lib/services/capital'
import { supabase } from '@/lib/services/supabase'

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

    // 2. Get peak equity (highest equity ever recorded)
    const { data: peakRow } = await supabase
      .from('equity_snapshots')
      .select('equity')
      .order('equity', { ascending: false })
      .limit(1)
      .single()

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

    return NextResponse.json({
      success: true,
      summary: `Equity: $${equity.toFixed(2)}, Drawdown: ${drawdownPercent.toFixed(2)}%, Daily P&L: $${dailyPnl.toFixed(2)}`,
    })
  } catch (error) {
    console.error('[cron/ingest-equity] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
