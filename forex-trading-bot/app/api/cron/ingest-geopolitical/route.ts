import { NextResponse } from 'next/server'
import { fetchGeopoliticalNews } from '@/lib/services/gdelt'
import { supabase } from '@/lib/services/supabase'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const articles = await fetchGeopoliticalNews()

    if (articles.length === 0) {
      await logCron('ingest-geopolitical', 'No geopolitical headlines from GDELT')
      return NextResponse.json({ success: true, summary: 'No articles found' })
    }

    // Upsert into news_cache — avoid duplicates by checking title
    const rows = articles.map(a => ({
      title: a.title,
      url: a.url,
      source: a.source,
      category: 'geopolitical' as const,
      published_at: a.published_at,
      fetched_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('news_cache')
      .upsert(rows, { onConflict: 'title' })

    if (error) {
      console.error('[ingest-geopolitical] Upsert failed:', error.message, error.details, error.hint)
      // Fall back to individual inserts, ignoring duplicates
      let inserted = 0
      for (const row of rows) {
        const { error: singleErr } = await supabase.from('news_cache').upsert(row, { onConflict: 'title' })
        if (!singleErr) inserted++
      }
      if (inserted === 0) {
        throw new Error(`news_cache: all ${rows.length} inserts failed. Original error: ${error.message}`)
      }
    }

    const msg = `Fetched ${articles.length} geopolitical headlines from GDELT (sanctions, conflicts, elections, energy).`
    await logCron('ingest-geopolitical', msg)

    return NextResponse.json({ success: true, count: articles.length, summary: msg })
  } catch (error) {
    const msg = `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    await logCron('ingest-geopolitical', msg, false).catch(() => {})
    console.error('[cron/ingest-geopolitical] Error:', error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
