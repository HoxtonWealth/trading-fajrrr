import { NextResponse } from 'next/server'
import { fetchCandles, OandaCandle } from '@/lib/services/oanda'
import { supabase } from '@/lib/services/supabase'
import { calculateEMA } from '@/lib/indicators/ema'
import { calculateADX } from '@/lib/indicators/adx'
import { calculateATR } from '@/lib/indicators/atr'
import { Candle } from '@/lib/indicators/types'

const INSTRUMENT = 'XAU_USD'
const GRANULARITY = 'H4'
const CANDLE_COUNT = 100 // Enough for ADX(14) which needs ~29 candles minimum

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Fetch candles from OANDA
    const oandaCandles = await fetchCandles(INSTRUMENT, GRANULARITY, CANDLE_COUNT)

    // Only process complete candles
    const completeCandles = oandaCandles.filter(c => c.complete)

    if (completeCandles.length === 0) {
      return NextResponse.json({ success: true, summary: 'No complete candles to process' })
    }

    // 2. Convert to our candle format
    const candles: Candle[] = completeCandles.map(oandaCandleToCandle)

    // 3. Upsert candles to Supabase
    const candleRows = completeCandles.map(c => ({
      instrument: INSTRUMENT,
      granularity: GRANULARITY,
      time: c.time,
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }))

    const { error: candleError } = await supabase
      .from('candles')
      .upsert(candleRows, { onConflict: 'instrument,granularity,time' })

    if (candleError) {
      throw new Error(`Candle upsert failed: ${candleError.message}`)
    }

    // 4. Compute indicators
    const ema20 = calculateEMA(candles, 20)
    const ema50 = calculateEMA(candles, 50)
    const adx14 = calculateADX(candles, 14)
    const atr14 = calculateATR(candles, 14)

    // 5. Build indicator rows — align to the most recent candles
    // Each indicator array corresponds to the tail of the candles array.
    // We only upsert rows where ALL indicators have values.
    const indicatorRows = []
    const len = candles.length

    // EMA20 starts at index 19 (length = len - 19)
    // EMA50 starts at index 49 (length = len - 49)
    // ADX14 starts at index 28 (length = len - 28) — needs 2*14+1=29 candles
    // ATR14 starts at index 14 (length = len - 14) — needs 15 candles
    // The limiting factor is EMA50: starts at candle index 49
    const startIdx = 49 // first candle index where all indicators are available

    for (let i = startIdx; i < len; i++) {
      const ema20Idx = i - 19    // offset into ema20 array
      const ema50Idx = i - 49    // offset into ema50 array
      const adx14Idx = i - 28    // offset into adx14 array
      const atr14Idx = i - 14    // offset into atr14 array

      if (
        ema20Idx >= 0 && ema20Idx < ema20.length &&
        ema50Idx >= 0 && ema50Idx < ema50.length &&
        adx14Idx >= 0 && adx14Idx < adx14.length &&
        atr14Idx >= 0 && atr14Idx < atr14.length
      ) {
        indicatorRows.push({
          instrument: INSTRUMENT,
          granularity: GRANULARITY,
          time: candles[i].time,
          ema_20: ema20[ema20Idx],
          ema_50: ema50[ema50Idx],
          adx_14: adx14[adx14Idx],
          atr_14: atr14[atr14Idx],
        })
      }
    }

    if (indicatorRows.length > 0) {
      const { error: indicatorError } = await supabase
        .from('indicators')
        .upsert(indicatorRows, { onConflict: 'instrument,granularity,time' })

      if (indicatorError) {
        throw new Error(`Indicator upsert failed: ${indicatorError.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      summary: `Upserted ${candleRows.length} candles and ${indicatorRows.length} indicator rows for ${INSTRUMENT} ${GRANULARITY}`,
    })
  } catch (error) {
    console.error('[cron/ingest-candles] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function oandaCandleToCandle(c: OandaCandle): Candle {
  return {
    time: c.time,
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    volume: c.volume,
  }
}
