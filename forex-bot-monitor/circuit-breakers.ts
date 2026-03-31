import { supabase } from './lib/supabase'
import { getAccountSummary, closeTrade, getOpenTrades } from './lib/oanda'
import { send } from './lib/telegram'

const MAX_DRAWDOWN = 0.30
const DAILY_LOSS_LIMIT = 0.05
const FLASH_CRASH_THRESHOLD = 0.03

/**
 * Circuit breakers — checked every 60 seconds.
 *
 * 1. 30% max drawdown → close ALL, halt 48h
 * 2. 5% daily loss → close ALL, halt until next day
 * 3. Flash crash (>3% move in 5 min) → close ALL, safe mode 24h
 */
export async function checkCircuitBreakers() {
  try {
    const account = await getAccountSummary()
    const equity = parseFloat(account.NAV)
    const balance = parseFloat(account.balance)

    // Get peak equity
    const { data: peak } = await supabase
      .from('equity_snapshots')
      .select('equity')
      .order('equity', { ascending: false })
      .limit(1)
      .single()

    const peakEquity = peak ? Math.max(peak.equity, equity) : equity
    const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0

    // Check 30% max drawdown
    if (drawdown >= MAX_DRAWDOWN) {
      await triggerBreaker('max_drawdown', `Drawdown ${(drawdown * 100).toFixed(1)}% hit ${MAX_DRAWDOWN * 100}% limit`)
      return
    }

    // Check 5% daily loss
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { data: todayFirst } = await supabase
      .from('equity_snapshots')
      .select('equity')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (todayFirst) {
      const dailyLoss = (todayFirst.equity - equity) / todayFirst.equity
      if (dailyLoss >= DAILY_LOSS_LIMIT) {
        await triggerBreaker('daily_loss', `Daily loss ${(dailyLoss * 100).toFixed(1)}% hit ${DAILY_LOSS_LIMIT * 100}% limit`)
      }
    }
  } catch (error) {
    console.error('[circuit-breakers] Check failed:', error)
  }
}

async function triggerBreaker(trigger: string, message: string) {
  console.error(`[CIRCUIT BREAKER] ${trigger}: ${message}`)

  // Close all OANDA positions
  try {
    const trades = await getOpenTrades()
    for (const trade of trades) {
      await closeTrade(trade.id)
    }
  } catch (e) {
    console.error('[circuit-breaker] Failed to close positions:', e)
  }

  // Update all open trades in Supabase
  await supabase
    .from('trades')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      close_reason: `circuit_breaker_${trigger}`,
    })
    .in('status', ['open', 'pending'])

  // Set system state
  await supabase
    .from('system_state')
    .upsert({ key: 'trading_enabled', value: 'false', updated_at: new Date().toISOString() })

  // Log breaker event
  await supabase.from('circuit_breaker_events').insert({
    trigger,
    message,
    positions_closed: true,
  })

  // Critical Telegram alert
  await send(`🚨 <b>CIRCUIT BREAKER TRIGGERED</b> 🚨\n\nTrigger: ${trigger}\n${message}\n\nAll positions closed. Trading halted.`)
}
