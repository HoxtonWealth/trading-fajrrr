import { NextResponse } from 'next/server'
import { fetchCandles, OandaCandle } from '@/lib/services/capital'
import { supabase } from '@/lib/services/supabase'
import { calculateEMA } from '@/lib/indicators/ema'
import { calculateADX } from '@/lib/indicators/adx'
import { calculateATR } from '@/lib/indicators/atr'
import { calculateRSI } from '@/lib/indicators/rsi'
import { calculateBollingerBands } from '@/lib/indicators/bollinger'
import { Candle } from '@/lib/indicators/types'

const INSTRUMENTS = ['XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD']
const GRANULARITY = 'H4'
const CANDLE_COUNT = 100 // Enough for ADX(14) which needs ~29 candles minimum

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: string[] = []

    for (const instrument of INSTRUMENTS) {
      const summary = await ingestInstrument(instrument, GRANULARITY, CANDLE_COUNT)
      results.push(summary)
    }

    return NextResponse.json({
      success: true,
      summary: results.join(' | '),
    })
  } catch (error) {
    console.error('[cron/ingest-candles] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function ingestInstrument(instrument: string, granularity: string, count: number): Promise<string> {
  const oandaCandles = await fetchCandles(instrument, granularity, count)
  const completeCandles = oandaCandles.filter(c => c.complete)

  if (completeCandles.length === 0) {
    return `${instrument}: no complete candles`
  }

  const candles: Candle[] = completeCandles.map(oandaCandleToCandle)

  // Upsert candles
  const candleRows = completeCandles.map(c => ({
    instrument,
    granularity,
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
    throw new Error(`Candle upsert failed for ${instrument}: ${candleError.message}`)
  }

  // Compute all indicators
  const ema20 = calculateEMA(candles, 20)
  const ema50 = calculateEMA(candles, 50)
  const adx14 = calculateADX(candles, 14)
  const atr14 = calculateATR(candles, 14)
  const rsi14 = calculateRSI(candles, 14)
  const bb20 = calculateBollingerBands(candles, 20, 2)

  // Build indicator rows — start at index 49 (EMA50 is the limiting factor)
  const indicatorRows = []
  const len = candles.length
  const startIdx = 49

  for (let i = startIdx; i < len; i++) {
    const ema20Idx = i - 19
    const ema50Idx = i - 49
    const adx14Idx = i - 28
    const atr14Idx = i - 14
    const rsi14Idx = i - 14   // RSI(14): length = candles.length - 14
    const bb20Idx = i - 19    // BB(20): length = candles.length - 19

    if (
      ema20Idx >= 0 && ema20Idx < ema20.length &&
      ema50Idx >= 0 && ema50Idx < ema50.length &&
      adx14Idx >= 0 && adx14Idx < adx14.length &&
      atr14Idx >= 0 && atr14Idx < atr14.length
    ) {
      indicatorRows.push({
        instrument,
        granularity,
        time: candles[i].time,
        ema_20: ema20[ema20Idx],
        ema_50: ema50[ema50Idx],
        adx_14: adx14[adx14Idx],
        atr_14: atr14[atr14Idx],
        rsi_14: rsi14Idx >= 0 && rsi14Idx < rsi14.length ? rsi14[rsi14Idx] : null,
        bb_upper: bb20Idx >= 0 && bb20Idx < bb20.length ? bb20[bb20Idx].upper : null,
        bb_middle: bb20Idx >= 0 && bb20Idx < bb20.length ? bb20[bb20Idx].middle : null,
        bb_lower: bb20Idx >= 0 && bb20Idx < bb20.length ? bb20[bb20Idx].lower : null,
      })
    }
  }

  if (indicatorRows.length > 0) {
    const { error: indicatorError } = await supabase
      .from('indicators')
      .upsert(indicatorRows, { onConflict: 'instrument,granularity,time' })

    if (indicatorError) {
      throw new Error(`Indicator upsert failed for ${instrument}: ${indicatorError.message}`)
    }
  }

  return `${instrument}: ${candleRows.length} candles, ${indicatorRows.length} indicators`
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
