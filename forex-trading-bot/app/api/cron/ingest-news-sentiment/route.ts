import { NextResponse } from 'next/server'
import { fetchForexNews } from '@/lib/services/finnhub'
import { getGeopoliticalSentiment } from '@/lib/services/gdelt'
import { callLLM } from '@/lib/services/openrouter'
import { supabase } from '@/lib/services/supabase'
import { logCron } from '@/lib/services/cron-logger'
import { getActiveInstruments } from '@/lib/instruments'

const INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  XAU_USD: ['gold', 'xau', 'precious metal', 'bullion', 'safe haven'],
  EUR_GBP: ['euro pound', 'eur/gbp', 'ecb boe', 'sterling euro'],
  EUR_USD: ['euro dollar', 'eur/usd', 'eurusd', 'ecb fed', 'european central bank'],
  USD_JPY: ['dollar yen', 'usd/jpy', 'usdjpy', 'boj', 'bank of japan', 'japanese yen'],
  BCO_USD: ['brent', 'crude oil', 'opec', 'oil price', 'petroleum'],
  US30_USD: ['dow jones', 'djia', 'us30', 'wall street', 'dow industrials'],
  AUD_USD: ['australian dollar', 'aud/usd', 'audusd', 'rba', 'reserve bank of australia', 'aussie dollar'],
  GBP_USD: ['british pound', 'gbp/usd', 'gbpusd', 'cable', 'sterling', 'bank of england', 'boe'],
  NZD_USD: ['new zealand dollar', 'nzd/usd', 'nzdusd', 'kiwi dollar', 'rbnz'],
  XAG_USD: ['silver', 'xag', 'silver price', 'precious metal silver'],
  US500_USD: ['s&p 500', 'sp500', 'spx', 'us500', 's&p index'],
  GER40_EUR: ['dax', 'german stock', 'ger40', 'germany 40', 'deutsche börse', 'german equities'],
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const INSTRUMENTS = await getActiveInstruments()

  try {
    const news = await fetchForexNews()

    if (!news || news.length === 0) {
      return NextResponse.json({ success: true, summary: 'No news articles found' })
    }

    const results: string[] = []

    for (const instrument of INSTRUMENTS) {
      const keywords = INSTRUMENT_KEYWORDS[instrument] ?? []

      // Filter headlines relevant to this instrument
      const relevant = news.filter(article => {
        const text = `${article.headline} ${article.summary}`.toLowerCase()
        return keywords.some(kw => text.includes(kw))
      })

      if (relevant.length === 0) {
        // No relevant news → neutral sentiment
        await supabase.from('news_sentiment').insert({
          instrument,
          score: 0,
          headline_count: 0,
          headlines: [],
          source: 'finnhub',
        })
        results.push(`${instrument}: 0 headlines, score=0`)
        continue
      }

      // Score via LLM
      const headlineList = relevant
        .slice(0, 15) // Cap at 15 headlines to save tokens
        .map((a, i) => `${i + 1}. ${a.headline}`)
        .join('\n')

      let score = 0

      try {
        const llmResponse = await callLLM({
          tier: 'cheap',
          systemPrompt: `You are a financial sentiment analyzer. Given news headlines related to ${instrument}, output a single number between -1.0 (very bearish) and +1.0 (very bullish). Output ONLY the number, nothing else.`,
          userPrompt: `Rate the overall sentiment of these headlines for ${instrument}:\n\n${headlineList}`,
          maxTokens: 10,
          temperature: 0.1,
        })

        const parsed = parseFloat(llmResponse.content.trim())
        if (!isNaN(parsed) && parsed >= -1 && parsed <= 1) {
          score = parsed
        }
      } catch (llmError) {
        console.error(`[ingest-news-sentiment] LLM failed for ${instrument}, defaulting to 0:`, llmError)
        score = 0
      }

      await supabase.from('news_sentiment').insert({
        instrument,
        score,
        headline_count: relevant.length,
        headlines: relevant.slice(0, 15).map(a => a.headline),
        source: 'finnhub',
      })

      results.push(`${instrument}: ${relevant.length} headlines, score=${score.toFixed(2)}`)

      // Also ingest GDELT geopolitical sentiment for this instrument
      try {
        const gdelt = await getGeopoliticalSentiment(instrument)
        if (gdelt.articleCount > 0) {
          const gdeltHeadlines = gdelt.articles
            .slice(0, 10)
            .map((a, i) => `${i + 1}. ${a.title}`)
            .join('\n')

          let gdeltScore = 0
          try {
            const gdeltLLM = await callLLM({
              tier: 'cheap',
              systemPrompt: `You are a geopolitical sentiment analyzer. Given GDELT news headlines related to ${instrument}, output a single number between -1.0 (very bearish) and +1.0 (very bullish). Output ONLY the number.`,
              userPrompt: `Rate the geopolitical sentiment for ${instrument}:\n\n${gdeltHeadlines}`,
              maxTokens: 10,
              temperature: 0.1,
            })
            const parsed = parseFloat(gdeltLLM.content.trim())
            if (!isNaN(parsed) && parsed >= -1 && parsed <= 1) gdeltScore = parsed
          } catch {
            gdeltScore = 0
          }

          await supabase.from('news_sentiment').insert({
            instrument,
            score: gdeltScore,
            headline_count: gdelt.articleCount,
            headlines: gdelt.articles.slice(0, 10).map(a => a.title),
            source: 'gdelt',
          })

          results.push(`${instrument} (GDELT): ${gdelt.articleCount} headlines, score=${gdeltScore.toFixed(2)}`)
        }
      } catch (gdeltErr) {
        console.error(`[ingest-news-sentiment] GDELT failed for ${instrument}:`, gdeltErr)
      }
    }

    // Build human summary
    const totalHeadlines = results.reduce((s, r) => s + parseInt(r.split(' ')[1] || '0'), 0)
    const msg = totalHeadlines > 0
      ? `Read ${news.length} news articles. AI scored sentiment for each market — helps decide whether to boost or skip trades.`
      : `Checked the news — nothing relevant to our markets right now.`
    await logCron('ingest-news-sentiment', msg)

    return NextResponse.json({ success: true, summary: results.join(' | ') })
  } catch (error) {
    await logCron('ingest-news-sentiment', `Failed to read news: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/ingest-news-sentiment] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
