import { supabase } from './lib/supabase'
import { placeMarketOrder } from './lib/capital'
import { send } from './lib/telegram'

/**
 * Reads pending trades from Supabase and executes them on OANDA.
 */
export async function executePendingTrades() {
  const { data: pending } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'pending')

  if (!pending || pending.length === 0) return

  for (const trade of pending) {
    try {
      const units = trade.direction === 'short' ? -trade.units : trade.units

      const result = await placeMarketOrder(trade.instrument, units, trade.stop_loss)

      const actualPrice = result.orderFillTransaction?.price
        ? parseFloat(result.orderFillTransaction.price)
        : trade.entry_price

      await supabase
        .from('trades')
        .update({
          status: 'open',
          expected_price: trade.entry_price,
          actual_price: actualPrice,
          slippage: actualPrice - trade.entry_price,
        })
        .eq('id', trade.id)

      console.log(`[executor] Executed ${trade.direction} ${trade.instrument}: ${trade.units} units`)
    } catch (error) {
      console.error(`[executor] Failed to execute trade ${trade.id}:`, error)
      await send(`❌ <b>Execution Failed</b>\n${trade.instrument} ${trade.direction}\nError: ${error instanceof Error ? error.message : 'Unknown'}`)

      await supabase
        .from('trades')
        .update({ status: 'cancelled', close_reason: 'execution_failed' })
        .eq('id', trade.id)
    }
  }
}
