import { supabase } from '@/lib/services/supabase'
import { getBrokerPositions, modifyTradeStopLoss } from '@/lib/services/capital'
import { STOP_MULTIPLIER_TREND, STOP_MULTIPLIER_MEAN_REV } from './constants'

export interface StopVerificationResult {
  checked: number
  valid: number
  fixed: Array<{ dealId: string; instrument: string; stopSet: number }>
  errors: Array<{ dealId: string; instrument: string; error: string }>
}

/**
 * Verify every open Capital.com position has a stop loss.
 * If missing, calculate a safe stop from ATR and set it immediately.
 */
export async function verifyStopLosses(): Promise<StopVerificationResult> {
  const result: StopVerificationResult = {
    checked: 0,
    valid: 0,
    fixed: [],
    errors: [],
  }

  const positions = await getBrokerPositions()
  result.checked = positions.length

  for (const pos of positions) {
    // Stop exists and is valid
    if (pos.stopLevel !== null && pos.stopLevel !== 0) {
      result.valid++
      continue
    }

    // Missing stop — calculate and set one
    try {
      // Get latest ATR for this instrument
      const { data: indicator } = await supabase
        .from('indicators')
        .select('atr_14')
        .eq('instrument', pos.instrument)
        .order('time', { ascending: false })
        .limit(1)
        .single()

      if (!indicator?.atr_14) {
        result.errors.push({
          dealId: pos.dealId,
          instrument: pos.instrument,
          error: 'No ATR data available',
        })
        continue
      }

      // Determine strategy from matching Supabase trade
      const { data: trade } = await supabase
        .from('trades')
        .select('strategy')
        .or(`deal_id.eq.${pos.dealId},and(instrument.eq.${pos.instrument},status.eq.open)`)
        .limit(1)
        .single()

      const strategy = trade?.strategy ?? 'trend' // default to trend (more conservative stop)
      const multiplier = strategy === 'mean_reversion' ? STOP_MULTIPLIER_MEAN_REV : STOP_MULTIPLIER_TREND
      const stopDistance = indicator.atr_14 * multiplier

      const stopLevel = pos.direction === 'BUY'
        ? pos.entryLevel - stopDistance
        : pos.entryLevel + stopDistance

      await modifyTradeStopLoss(pos.dealId, stopLevel)

      // Also update Supabase trade's stop_loss
      await supabase
        .from('trades')
        .update({ stop_loss: stopLevel })
        .or(`deal_id.eq.${pos.dealId},and(instrument.eq.${pos.instrument},status.eq.open)`)

      result.fixed.push({
        dealId: pos.dealId,
        instrument: pos.instrument,
        stopSet: stopLevel,
      })
    } catch (err) {
      result.errors.push({
        dealId: pos.dealId,
        instrument: pos.instrument,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return result
}
