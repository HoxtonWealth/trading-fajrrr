import { supabase } from '@/lib/services/supabase'
import { getOpenTrades, modifyTradeStopLoss } from '@/lib/services/capital'
import { alertWeekend } from '@/lib/services/telegram'
import {
  FRIDAY_TIGHTEN_HOUR_UTC,
  FRIDAY_TIGHTEN_MINUTE_UTC,
  SUNDAY_REOPEN_HOUR_UTC,
} from './constants'

export interface WeekendCheckResult {
  action: 'enter_weekend' | 'exit_weekend' | 'none'
  details: string
}

/**
 * Checks if we should enter or exit weekend mode.
 *
 * Friday 19:30 UTC → enter weekend mode:
 *   - Close all mean reversion positions
 *   - Tighten trend stops to 1x ATR
 *   - Block new entries
 *
 * Sunday 22:00 UTC → exit weekend mode:
 *   - Resume normal trading
 */
export function shouldEnterWeekend(now: Date = new Date()): boolean {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()

  // Friday (5) after 19:30 UTC
  if (day === 5 && (hour > FRIDAY_TIGHTEN_HOUR_UTC || (hour === FRIDAY_TIGHTEN_HOUR_UTC && minute >= FRIDAY_TIGHTEN_MINUTE_UTC))) {
    return true
  }
  // Saturday (6) — all day
  if (day === 6) return true
  // Sunday (0) before 22:00 UTC
  if (day === 0 && hour < SUNDAY_REOPEN_HOUR_UTC) return true

  return false
}

export function shouldExitWeekend(now: Date = new Date()): boolean {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()

  // Sunday 22:00+ UTC or Monday-Thursday
  return (day === 0 && hour >= SUNDAY_REOPEN_HOUR_UTC) || (day >= 1 && day <= 4)
}

export async function handleWeekendTransition(): Promise<WeekendCheckResult> {
  const { data: state } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'weekend_mode')
    .single()

  const isWeekendMode = state?.value === 'true'
  const now = new Date()

  // Enter weekend mode
  if (!isWeekendMode && shouldEnterWeekend(now)) {
    // 1. Close all mean reversion trades
    const { data: mrTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('strategy', 'mean_reversion')
      .in('status', ['open', 'pending'])

    if (mrTrades && mrTrades.length > 0) {
      for (const trade of mrTrades) {
        await supabase
          .from('trades')
          .update({
            status: 'closed',
            closed_at: now.toISOString(),
            close_reason: 'weekend_close',
          })
          .eq('id', trade.id)
      }
    }

    // 2. Tighten trend stops to 1x ATR (via OANDA)
    try {
      const oandaTrades = await getOpenTrades()
      for (const oTrade of oandaTrades) {
        // Get latest ATR for this instrument
        const { data: ind } = await supabase
          .from('indicators')
          .select('atr_14')
          .eq('instrument', oTrade.instrument)
          .order('time', { ascending: false })
          .limit(1)
          .single()

        if (ind) {
          const price = parseFloat(oTrade.price)
          const isLong = parseInt(oTrade.currentUnits) > 0
          const tightStop = isLong
            ? price - ind.atr_14
            : price + ind.atr_14
          await modifyTradeStopLoss(oTrade.id, tightStop)
        }
      }
    } catch (error) {
      console.error('[weekend-handler] Failed to tighten stops on OANDA:', error)
    }

    // 3. Set weekend mode
    await supabase
      .from('system_state')
      .upsert({ key: 'weekend_mode', value: 'true', updated_at: now.toISOString() })

    const details = `Weekend mode ON. Closed ${mrTrades?.length ?? 0} MR trades, tightened trend stops.`
    alertWeekend('enter_weekend', details).catch(() => {})

    return { action: 'enter_weekend', details }
  }

  // Exit weekend mode
  if (isWeekendMode && shouldExitWeekend(now)) {
    await supabase
      .from('system_state')
      .upsert({ key: 'weekend_mode', value: 'false', updated_at: now.toISOString() })

    alertWeekend('exit_weekend', 'Normal trading resumed.').catch(() => {})

    return {
      action: 'exit_weekend',
      details: 'Weekend mode OFF. Normal trading resumed.',
    }
  }

  return { action: 'none', details: isWeekendMode ? 'In weekend mode' : 'Normal trading hours' }
}
