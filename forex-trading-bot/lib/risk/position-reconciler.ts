import { supabase } from '@/lib/services/supabase'
import { getBrokerPositions, BrokerPosition } from '@/lib/services/capital'
import { TradeRow } from '@/lib/types/database'

export interface ReconciliationResult {
  brokerPositionCount: number
  supabaseOpenCount: number
  brokerClosed: Array<{ tradeId: string; instrument: string; reason: string }>
  orphaned: Array<{ tradeId: string; instrument: string; reason: string }>
  matched: number
  actions: string[]
}

function directionMatches(supabaseDir: string, brokerDir: 'BUY' | 'SELL'): boolean {
  return (supabaseDir === 'long' && brokerDir === 'BUY') ||
         (supabaseDir === 'short' && brokerDir === 'SELL')
}

/**
 * Reconcile Capital.com positions with Supabase trades.
 *
 * Detects:
 * - Broker-closed positions (margin call, auto-close) → marks closed in Supabase
 * - Orphaned Supabase records → marks closed
 * - Legacy trades without deal_id → backfills where possible
 */
export async function reconcilePositions(): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    brokerPositionCount: 0,
    supabaseOpenCount: 0,
    brokerClosed: [],
    orphaned: [],
    matched: 0,
    actions: [],
  }

  // 1. Get broker positions
  const brokerPositions = await getBrokerPositions()
  result.brokerPositionCount = brokerPositions.length
  const brokerByDealId = new Map<string, BrokerPosition>()
  for (const p of brokerPositions) {
    brokerByDealId.set(p.dealId, p)
  }

  // 2. Get Supabase open trades
  const { data: openTrades, error } = await supabase
    .from('trades')
    .select('*')
    .in('status', ['open', 'pending'])

  if (error) {
    throw new Error(`Failed to fetch open trades: ${error.message}`)
  }

  const trades = (openTrades ?? []) as TradeRow[]
  result.supabaseOpenCount = trades.length

  // Track which broker positions have been matched
  const matchedDealIds = new Set<string>()

  for (const trade of trades) {
    // 3a. Trade has a deal_id — exact match
    if (trade.deal_id) {
      const brokerPos = brokerByDealId.get(trade.deal_id)
      if (brokerPos) {
        result.matched++
        matchedDealIds.add(trade.deal_id)
        continue
      }

      // Not found on broker — broker closed this position
      await supabase
        .from('trades')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          close_reason: 'broker_closed',
        })
        .eq('id', trade.id)

      result.brokerClosed.push({
        tradeId: trade.id,
        instrument: trade.instrument,
        reason: `deal_id ${trade.deal_id} not found on broker`,
      })
      result.actions.push(`Closed ${trade.instrument} (broker-closed)`)
      continue
    }

    // 3b. No deal_id — fuzzy match by instrument + direction + ~size
    const candidates = brokerPositions.filter(p =>
      p.instrument === trade.instrument &&
      directionMatches(trade.direction, p.direction) &&
      !matchedDealIds.has(p.dealId) &&
      Math.abs(p.size - trade.units) / trade.units < 0.1 // within 10%
    )

    if (candidates.length === 1) {
      // Backfill deal_id
      await supabase
        .from('trades')
        .update({ deal_id: candidates[0].dealId })
        .eq('id', trade.id)

      result.matched++
      matchedDealIds.add(candidates[0].dealId)
      result.actions.push(`Backfilled deal_id for ${trade.instrument}`)
      continue
    }

    if (candidates.length > 1) {
      result.orphaned.push({
        tradeId: trade.id,
        instrument: trade.instrument,
        reason: 'ambiguous match — multiple broker positions',
      })
      continue
    }

    // No match at all — orphaned record
    await supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: 'orphan_reconciled',
      })
      .eq('id', trade.id)

    result.orphaned.push({
      tradeId: trade.id,
      instrument: trade.instrument,
      reason: 'no matching broker position',
    })
    result.actions.push(`Closed orphaned ${trade.instrument}`)
  }

  return result
}
