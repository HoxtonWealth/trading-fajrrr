import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { logCron } from '@/lib/services/cron-logger'

const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

interface FFCalendarEvent {
  title: string
  country: string
  date: string
  impact: string // 'High' | 'Medium' | 'Low' | 'Holiday'
  forecast: string
  previous: string
}

/** Map FF country codes (USD, EUR, etc.) to ISO country codes for consistency */
const COUNTRY_MAP: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP',
  AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH', CNY: 'CN',
}

const RELEVANT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const response = await fetch(FF_CALENDAR_URL)

    if (!response.ok) {
      throw new Error(`ForexFactory calendar API error ${response.status}`)
    }

    const events = await response.json() as FFCalendarEvent[]

    // Filter for relevant currencies and high/medium impact
    const now = new Date()
    const relevantEvents = events.filter(e =>
      RELEVANT_CURRENCIES.includes(e.country) &&
      ['High', 'Medium'].includes(e.impact) &&
      new Date(e.date) >= now
    )

    if (relevantEvents.length === 0) {
      await logCron('ingest-calendar', 'No upcoming high/medium impact events this week.')
      return NextResponse.json({ success: true, summary: 'No relevant events found' })
    }

    // Upsert events
    const rows = relevantEvents.map(e => ({
      event_name: e.title,
      country: COUNTRY_MAP[e.country] ?? e.country,
      impact: e.impact.toLowerCase() as 'high' | 'medium',
      event_time: e.date,
      actual: null,
      estimate: e.forecast || null,
      previous: e.previous || null,
      source: 'forexfactory',
    }))

    const { error } = await supabase
      .from('economic_events')
      .upsert(rows, { onConflict: 'event_name,event_time' })

    if (error) {
      throw new Error(`Event upsert failed: ${error.message}`)
    }

    const highCount = rows.filter(r => r.impact === 'high').length
    const msg = `Loaded ${rows.length} upcoming events (${highCount} high-impact) from ForexFactory.`
    await logCron('ingest-calendar', msg)

    return NextResponse.json({
      success: true,
      summary: `Upserted ${rows.length} events (${highCount} high-impact)`,
    })
  } catch (error) {
    await logCron('ingest-calendar', `Failed: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/ingest-calendar] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
