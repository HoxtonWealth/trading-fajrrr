import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { logCron } from '@/lib/services/cron-logger'

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

interface FinnhubCalendarEvent {
  country: string
  event: string
  impact: string
  time: string
  actual?: number
  estimate?: number
  prev?: number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!FINNHUB_API_KEY) {
      return NextResponse.json({ success: false, error: 'FINNHUB_API_KEY not set' }, { status: 500 })
    }

    // Fetch next 7 days of economic events
    const from = new Date().toISOString().split('T')[0]
    const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const response = await fetch(
      `${FINNHUB_BASE_URL}/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    )

    if (response.status === 403) {
      await logCron('ingest-calendar', 'Economic calendar needs a premium API plan — skipped. Bot trades fine without it.')
      return NextResponse.json({
        success: true,
        summary: 'Finnhub calendar requires premium plan — skipped.',
      })
    }

    if (!response.ok) {
      throw new Error(`Finnhub calendar API error ${response.status}`)
    }

    const data = await response.json() as { economicCalendar: FinnhubCalendarEvent[] }
    const events = data.economicCalendar ?? []

    // Filter for relevant countries and high/medium impact
    const relevantCountries = ['US', 'EU', 'GB', 'JP']
    const relevantEvents = events.filter(e =>
      relevantCountries.includes(e.country) &&
      ['high', 'medium'].includes(e.impact?.toLowerCase() ?? '')
    )

    if (relevantEvents.length === 0) {
      return NextResponse.json({ success: true, summary: 'No relevant events found' })
    }

    // Upsert events
    const rows = relevantEvents.map(e => ({
      event_name: e.event,
      country: e.country,
      impact: e.impact?.toLowerCase() === 'high' ? 'high' : 'medium',
      event_time: e.time,
      actual: e.actual?.toString() ?? null,
      estimate: e.estimate?.toString() ?? null,
      previous: e.prev?.toString() ?? null,
      source: 'finnhub',
    }))

    const { error } = await supabase
      .from('economic_events')
      .upsert(rows, { onConflict: 'event_name,event_time' })

    if (error) {
      throw new Error(`Event upsert failed: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      summary: `Upserted ${rows.length} events for next 7 days`,
    })
  } catch (error) {
    console.error('[cron/ingest-calendar] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
