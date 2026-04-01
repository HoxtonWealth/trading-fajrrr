import { supabase } from './lib/supabase'
import { getOpenTrades, modifyStopLoss } from './lib/capital'

/**
 * Monitors open positions and manages trailing stops.
 * Trailing stop: moves stop in profit direction, never backward.
 */
export async function monitorPositions() {
  const oandaTrades = await getOpenTrades()

  for (const trade of oandaTrades) {
    const units = parseInt(trade.currentUnits)
    const isLong = units > 0
    const currentPrice = parseFloat(trade.price)
    const currentStop = trade.stopLossOrder ? parseFloat(trade.stopLossOrder.price) : null

    if (!currentStop) continue

    // Get ATR for trailing stop calculation
    const { data: indicator } = await supabase
      .from('indicators')
      .select('atr_14')
      .eq('instrument', trade.instrument)
      .order('time', { ascending: false })
      .limit(1)
      .single()

    if (!indicator) continue

    const trailingDistance = indicator.atr_14 * 2.0 // 2x ATR trailing

    if (isLong) {
      const newStop = currentPrice - trailingDistance
      if (newStop > currentStop) {
        await modifyStopLoss(trade.id, newStop)
        console.log(`[monitor] Trailed stop for ${trade.instrument} long: ${currentStop.toFixed(4)} → ${newStop.toFixed(4)}`)
      }
    } else {
      const newStop = currentPrice + trailingDistance
      if (newStop < currentStop) {
        await modifyStopLoss(trade.id, newStop)
        console.log(`[monitor] Trailed stop for ${trade.instrument} short: ${currentStop.toFixed(4)} → ${newStop.toFixed(4)}`)
      }
    }
  }
}
