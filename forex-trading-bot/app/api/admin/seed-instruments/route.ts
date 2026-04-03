/**
 * One-time admin endpoint to seed new instruments into instrument_universe.
 * Added 2026-04-03 as part of trade frequency Quick Win #4.
 * Can be removed after instruments are confirmed in the DB.
 */
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'

const NEW_INSTRUMENTS = [
  { instrument: 'AUD_USD', display_name: 'AUD/USD', asset_class: 'forex', status: 'active', added_reason: 'Trade frequency analysis Win #4 — commodity currency, low correlation with EUR pairs' },
  { instrument: 'GBP_USD', display_name: 'GBP/USD', asset_class: 'forex', status: 'active', added_reason: 'Trade frequency analysis Win #4 — major pair, high liquidity' },
  { instrument: 'NZD_USD', display_name: 'NZD/USD', asset_class: 'forex', status: 'active', added_reason: 'Trade frequency analysis Win #4 — commodity currency, dairy/agriculture exposure' },
  { instrument: 'XAG_USD', display_name: 'Silver', asset_class: 'commodity', status: 'active', added_reason: 'Trade frequency analysis Win #4 — precious metal, industrial demand component' },
  { instrument: 'US500_USD', display_name: 'S&P 500', asset_class: 'index', status: 'active', added_reason: 'Trade frequency analysis Win #4 — broad US equity index' },
  { instrument: 'GER40_EUR', display_name: 'DAX', asset_class: 'index', status: 'active', added_reason: 'Trade frequency analysis Win #4 — European equity index' },
]

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = []

  for (const inst of NEW_INSTRUMENTS) {
    // Upsert — skip if already exists
    const { data, error } = await supabase
      .from('instrument_universe')
      .upsert(inst, { onConflict: 'instrument' })
      .select()

    results.push({
      instrument: inst.instrument,
      success: !error,
      error: error?.message,
      data,
    })
  }

  return NextResponse.json({
    message: `Seeded ${results.filter(r => r.success).length}/${NEW_INSTRUMENTS.length} instruments`,
    results,
  })
}
