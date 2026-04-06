import { supabase } from '@/lib/services/supabase'
import { getBrokerPositions, closePosition, modifyTradeStopLoss, BrokerPosition } from '@/lib/services/capital'
import { LEVERAGE_CAPS } from './constants'
import { AED_PER_USD } from './currency'
import { TradeRow } from '@/lib/types/database'

export interface CircuitBreakerAction {
  dealId: string
  instrument: string
  action: 'closed_blown_stop' | 'closed_over_leverage' | 'tightened_stop' | 'kept'
  details: string
}

export interface CircuitBreakerResult {
  actions: CircuitBreakerAction[]
  positionsClosed: number
  stopsTightened: number
  positionsKept: number
  errors: string[]
}

async function getTradeForPosition(pos: BrokerPosition): Promise<TradeRow | null> {
  const { data } = await supabase
    .from('trades')
    .select('*')
    .or(`deal_id.eq.${pos.dealId},and(instrument.eq.${pos.instrument},status.eq.open)`)
    .limit(1)
    .single()
  return data as TradeRow | null
}

async function getATR(instrument: string): Promise<number | null> {
  const { data } = await supabase
    .from('indicators')
    .select('atr_14')
    .eq('instrument', instrument)
    .order('time', { ascending: false })
    .limit(1)
    .single()
  return data?.atr_14 ?? null
}

async function closeAndRecord(
  pos: BrokerPosition,
  trade: TradeRow | null,
  reason: string,
): Promise<void> {
  // Close on broker
  await closePosition(pos.dealId)

  // Update Supabase
  const midPrice = (pos.currentBid + pos.currentOffer) / 2
  const exitPrice = pos.direction === 'BUY' ? pos.currentBid : pos.currentOffer

  if (trade) {
    const pnl = trade.direction === 'long'
      ? (exitPrice - trade.entry_price) * trade.units
      : (trade.entry_price - exitPrice) * trade.units

    await supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: reason,
        exit_price: exitPrice,
        pnl,
      })
      .eq('id', trade.id)
  }
}

/**
 * Graduated circuit breaker response — surgical position management at 30% drawdown.
 *
 * Tier 1: Close positions that have blown past their stop loss
 * Tier 2: Close positions exceeding leverage cap (using USD-converted equity)
 * Tier 3: Tighten remaining stops (breakeven if profitable, 1x ATR if losing)
 */
export async function executeCircuitBreakerResponse(
  equityAED: number,
): Promise<CircuitBreakerResult> {
  const result: CircuitBreakerResult = {
    actions: [],
    positionsClosed: 0,
    stopsTightened: 0,
    positionsKept: 0,
    errors: [],
  }

  const equityUSD = equityAED / AED_PER_USD
  let positions: BrokerPosition[]

  try {
    positions = await getBrokerPositions()
  } catch (err) {
    result.errors.push(`Failed to fetch broker positions: ${err instanceof Error ? err.message : 'Unknown'}`)
    return result
  }

  if (positions.length === 0) return result

  const surviving: BrokerPosition[] = []

  // --- Tier 1: Close positions past their stop ---
  for (const pos of positions) {
    const trade = await getTradeForPosition(pos)

    if (trade?.stop_loss) {
      const blownLong = pos.direction === 'BUY' && pos.currentBid < trade.stop_loss
      const blownShort = pos.direction === 'SELL' && pos.currentOffer > trade.stop_loss

      if (blownLong || blownShort) {
        try {
          await closeAndRecord(pos, trade, 'circuit_breaker_blown_stop')
          result.positionsClosed++
          result.actions.push({
            dealId: pos.dealId,
            instrument: pos.instrument,
            action: 'closed_blown_stop',
            details: `Price ${blownLong ? pos.currentBid : pos.currentOffer} past stop ${trade.stop_loss}`,
          })
          continue
        } catch (err) {
          result.errors.push(`Failed to close blown-stop ${pos.instrument}: ${err instanceof Error ? err.message : 'Unknown'}`)
        }
      }
    }

    surviving.push(pos)
  }

  // --- Tier 2: Close over-leveraged positions ---
  const stillAlive: BrokerPosition[] = []

  for (const pos of surviving) {
    const midPrice = (pos.currentBid + pos.currentOffer) / 2
    const notionalUSD = pos.size * midPrice
    const leverage = notionalUSD / equityUSD
    const cap = LEVERAGE_CAPS[pos.instrument] ?? 10

    if (leverage > cap) {
      const trade = await getTradeForPosition(pos)
      try {
        await closeAndRecord(pos, trade, 'circuit_breaker_over_leverage')
        result.positionsClosed++
        result.actions.push({
          dealId: pos.dealId,
          instrument: pos.instrument,
          action: 'closed_over_leverage',
          details: `Leverage ${leverage.toFixed(1)}x exceeds ${cap}x cap`,
        })
        continue
      } catch (err) {
        result.errors.push(`Failed to close over-leverage ${pos.instrument}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    stillAlive.push(pos)
  }

  // --- Tier 3: Tighten stops on remaining positions ---
  for (const pos of stillAlive) {
    const atr = await getATR(pos.instrument)
    if (!atr) {
      result.positionsKept++
      result.actions.push({
        dealId: pos.dealId,
        instrument: pos.instrument,
        action: 'kept',
        details: 'No ATR data — stop unchanged',
      })
      continue
    }

    // Calculate new stop: breakeven if profitable, 1x ATR if losing
    let newStop: number
    if (pos.direction === 'BUY') {
      const inProfit = pos.currentBid > pos.entryLevel
      newStop = inProfit ? pos.entryLevel : pos.entryLevel - atr
    } else {
      const inProfit = pos.currentOffer < pos.entryLevel
      newStop = inProfit ? pos.entryLevel : pos.entryLevel + atr
    }

    // Only tighten, never widen — check if new stop is tighter than existing
    const shouldTighten = pos.stopLevel === null || (
      pos.direction === 'BUY' ? newStop > pos.stopLevel : newStop < pos.stopLevel
    )

    if (shouldTighten) {
      try {
        await modifyTradeStopLoss(pos.dealId, newStop)

        // Update Supabase too
        await supabase
          .from('trades')
          .update({ stop_loss: newStop })
          .or(`deal_id.eq.${pos.dealId},and(instrument.eq.${pos.instrument},status.eq.open)`)

        result.stopsTightened++
        result.actions.push({
          dealId: pos.dealId,
          instrument: pos.instrument,
          action: 'tightened_stop',
          details: `Stop ${pos.stopLevel?.toFixed(4) ?? 'none'} → ${newStop.toFixed(4)}`,
        })
      } catch (err) {
        result.errors.push(`Failed to tighten stop on ${pos.instrument}: ${err instanceof Error ? err.message : 'Unknown'}`)
        result.positionsKept++
      }
    } else {
      result.positionsKept++
      result.actions.push({
        dealId: pos.dealId,
        instrument: pos.instrument,
        action: 'kept',
        details: `Existing stop ${pos.stopLevel?.toFixed(4)} already tighter`,
      })
    }
  }

  return result
}

/**
 * Daily loss response — tighten all stops to 1x ATR when 5% daily loss is hit.
 * Does NOT close positions, only reduces risk.
 */
export async function executeDailyLossResponse(): Promise<{
  stopsTightened: number
  errors: string[]
}> {
  let stopsTightened = 0
  const errors: string[] = []

  let positions: BrokerPosition[]
  try {
    positions = await getBrokerPositions()
  } catch (err) {
    return { stopsTightened: 0, errors: [`Failed to fetch positions: ${err instanceof Error ? err.message : 'Unknown'}`] }
  }

  for (const pos of positions) {
    const atr = await getATR(pos.instrument)
    if (!atr) continue

    const newStop = pos.direction === 'BUY'
      ? pos.entryLevel - atr * 1.5
      : pos.entryLevel + atr * 1.5

    // Only tighten
    const shouldTighten = pos.stopLevel === null || (
      pos.direction === 'BUY' ? newStop > pos.stopLevel : newStop < pos.stopLevel
    )

    if (shouldTighten) {
      try {
        await modifyTradeStopLoss(pos.dealId, newStop)
        await supabase
          .from('trades')
          .update({ stop_loss: newStop })
          .or(`deal_id.eq.${pos.dealId},and(instrument.eq.${pos.instrument},status.eq.open)`)
        stopsTightened++
      } catch (err) {
        errors.push(`Failed to tighten ${pos.instrument}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }
  }

  return { stopsTightened, errors }
}
