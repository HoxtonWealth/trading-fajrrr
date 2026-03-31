import { NextResponse } from 'next/server'
import { fetchForexNews } from '@/lib/services/finnhub'
import { callLLM } from '@/lib/services/openrouter'
import { supabase } from '@/lib/services/supabase'

const INSTRUMENTS = ['XAU_USD', 'EUR_GBP']

const INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  XAU_USD: ['gold', 'xau', 'precious metal', 'bullion', 'safe haven'],
  EUR_GBP: ['euro', 'eur', 'pound', 'gbp', 'sterling', 'ecb', 'boe', 'bank of england'],
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    }

    return NextResponse.json({
      success: true,
      summary: results.join(' | '),
    })
  } catch (error) {
    console.error('[cron/ingest-news-sentiment] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
