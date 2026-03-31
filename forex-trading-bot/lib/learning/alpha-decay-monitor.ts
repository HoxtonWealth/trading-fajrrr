import { supabase } from '@/lib/services/supabase'
import { alertCustom } from '@/lib/services/telegram'

/**
 * Alpha Decay Monitor — checks for strategy degradation.
 *
 * - Rolling 30/60/90-day Sharpe
 * - IC per agent
 * - Alert if 30-day Sharpe negative for 7 consecutive days
 */
export async function checkAlphaDecay(): Promise<{
  sharpe30: number
  sharpe60: number
  sharpe90: number
  alerts: string[]
}> {
  const alerts: string[] = []

  const sharpe30 = await computeRollingSharpe(30)
  const sharpe60 = await computeRollingSharpe(60)
  const sharpe90 = await computeRollingSharpe(90)

  // Check if 30-day Sharpe has been negative for 7 days
  if (sharpe30 < 0) {
    const { data: recentSnapshots } = await supabase
      .from('equity_snapshots')
      .select('equity, created_at')
      .order('created_at', { ascending: false })
      .limit(7 * 24 * 12) // ~7 days of 5-min snapshots

    if (recentSnapshots && recentSnapshots.length > 0) {
      // Simple check: has equity been declining for 7 days?
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const oldSnapshot = recentSnapshots.find(s => new Date(s.created_at) <= sevenDaysAgo)

      if (oldSnapshot && recentSnapshots[0].equity < oldSnapshot.equity) {
        const alert = `⚠️ 30-day Sharpe negative (${sharpe30.toFixed(3)}) with declining equity for 7+ days`
        alerts.push(alert)
        await alertCustom('Alpha Decay Warning', alert)
      }
    }
  }

  // Check per-agent IC
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('agent, instrument, win_rate')
    .gte('total_trades', 20)

  if (scorecards) {
    for (const sc of scorecards) {
      // IC proxy: if win rate below 40%, flag it
      if (sc.win_rate < 0.4) {
        alerts.push(`${sc.agent} on ${sc.instrument}: win rate ${(sc.win_rate * 100).toFixed(0)}% — consider evolution`)
      }
    }
  }

  return { sharpe30, sharpe60, sharpe90, alerts }
}

async function computeRollingSharpe(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: trades } = await supabase
    .from('trades')
    .select('pnl')
    .eq('status', 'closed')
    .not('pnl', 'is', null)
    .gte('closed_at', since)

  if (!trades || trades.length < 3) return 0

  const returns = trades.map(t => t.pnl)
  const avg = returns.reduce((s, v) => s + v, 0) / returns.length
  const std = Math.sqrt(returns.reduce((s, v) => s + (v - avg) ** 2, 0) / returns.length)

  return std > 0 ? (avg / std) * Math.sqrt(252) : 0
}
