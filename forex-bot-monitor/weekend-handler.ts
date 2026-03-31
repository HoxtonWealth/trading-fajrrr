import { supabase } from './lib/supabase'
import { getOpenTrades, modifyStopLoss, closeTrade } from './lib/oanda'
import { send } from './lib/telegram'

const FRIDAY_TIGHTEN_HOUR = 19
const FRIDAY_TIGHTEN_MINUTE = 30
const SUNDAY_REOPEN_HOUR = 22

export async function checkWeekend() {
  const now = new Date()
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()

  const { data: state } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'weekend_mode')
    .single()

  const isWeekend = state?.value === 'true'

  // Enter weekend: Friday 19:30+
  if (!isWeekend && day === 5 && (hour > FRIDAY_TIGHTEN_HOUR || (hour === FRIDAY_TIGHTEN_HOUR && minute >= FRIDAY_TIGHTEN_MINUTE))) {
    // Close MR trades on OANDA
    const { data: mrTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('strategy', 'mean_reversion')
      .in('status', ['open'])

    if (mrTrades) {
      for (const t of mrTrades) {
        try {
          const oandaTrades = await getOpenTrades()
          const match = oandaTrades.find((ot: any) => ot.instrument === t.instrument)
          if (match) await closeTrade(match.id)
        } catch (e) {
          console.error('[weekend] Failed to close MR trade:', e)
        }
      }
    }

    // Tighten trend stops to 1x ATR
    const openTrades = await getOpenTrades()
    for (const trade of openTrades) {
      const { data: ind } = await supabase
        .from('indicators')
        .select('atr_14')
        .eq('instrument', trade.instrument)
        .order('time', { ascending: false })
        .limit(1)
        .single()

      if (ind) {
        const price = parseFloat(trade.price)
        const isLong = parseInt(trade.currentUnits) > 0
        const tightStop = isLong ? price - ind.atr_14 : price + ind.atr_14
        await modifyStopLoss(trade.id, tightStop)
      }
    }

    await supabase.from('system_state').upsert({ key: 'weekend_mode', value: 'true', updated_at: now.toISOString() })
    await send('🌙 <b>Weekend Mode ON</b>\nMR positions closed, trend stops tightened to 1x ATR.')
  }

  // Exit weekend: Sunday 22:00+
  if (isWeekend && day === 0 && hour >= SUNDAY_REOPEN_HOUR) {
    await supabase.from('system_state').upsert({ key: 'weekend_mode', value: 'false', updated_at: now.toISOString() })
    await send('☀️ <b>Weekend Mode OFF</b>\nNormal trading resumed.')
  }
}
