import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { logCron } from '@/lib/services/cron-logger'
import type { MarketAssetRow } from '@/lib/types/database'

// --- Capital.com session (fresh per refresh, independent of trading bot's session) ---

const CAPITAL_BASE_URL = (process.env.CAPITAL_BASE_URL || 'https://demo-api-capital.backend-capital.com').replace(/\/+$/, '')
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY
const CAPITAL_IDENTIFIER = process.env.CAPITAL_IDENTIFIER
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD

interface CapitalSession {
  cst: string
  securityToken: string
}

async function createCapitalSession(): Promise<CapitalSession> {
  if (!CAPITAL_API_KEY || !CAPITAL_IDENTIFIER || !CAPITAL_PASSWORD) {
    throw new Error('Missing Capital.com credentials')
  }

  const response = await fetch(`${CAPITAL_BASE_URL}/api/v1/session`, {
    method: 'POST',
    headers: {
      'X-CAP-API-KEY': CAPITAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: CAPITAL_IDENTIFIER,
      password: CAPITAL_PASSWORD,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Capital.com auth failed ${response.status}: ${body}`)
  }

  const cst = response.headers.get('CST')
  const securityToken = response.headers.get('X-SECURITY-TOKEN')
  if (!cst || !securityToken) {
    throw new Error('Capital.com auth missing session tokens')
  }

  return { cst, securityToken }
}

interface CapitalMarketSnapshot {
  bid: number
  offer: number
}

interface CapitalMarket {
  epic: string
  instrumentName: string
  snapshot: CapitalMarketSnapshot
}

async function fetchCapitalPrices(session: CapitalSession, epics: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()

  // Capital.com /markets endpoint accepts comma-separated epics
  const epicStr = epics.join(',')
  const response = await fetch(`${CAPITAL_BASE_URL}/api/v1/markets?epics=${epicStr}`, {
    headers: {
      'X-SECURITY-TOKEN': session.securityToken,
      'CST': session.cst,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Capital.com markets API error ${response.status}: ${body}`)
  }

  const data = await response.json() as { marketDetails?: CapitalMarket[] }
  console.log(`[markets/refresh] Capital.com returned ${data.marketDetails?.length ?? 0} markets`)
  for (const market of data.marketDetails ?? []) {
    if (market.snapshot?.bid && market.snapshot?.offer) {
      const midPrice = (market.snapshot.bid + market.snapshot.offer) / 2
      prices.set(market.epic, midPrice)
    }
  }

  return prices
}

// --- Yahoo Finance ---

async function fetchYahooPrices(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()

  let yahooFinance: { quote: (ticker: string) => Promise<{ regularMarketPrice?: number }> }
  try {
    const mod = await import('yahoo-finance2')
    yahooFinance = mod.default || mod
  } catch (importError) {
    console.error('[markets/refresh] yahoo-finance2 import failed:', importError instanceof Error ? importError.message : importError)
    return prices
  }

  for (const ticker of tickers) {
    try {
      const result = await yahooFinance.quote(ticker)
      console.log(`[markets/refresh] Yahoo ${ticker}:`, JSON.stringify(result?.regularMarketPrice))
      if (result?.regularMarketPrice) {
        prices.set(ticker, result.regularMarketPrice)
      }
    } catch (error) {
      console.error(`[markets/refresh] Yahoo Finance failed for ${ticker}:`, error instanceof Error ? error.message : error)
    }
  }

  return prices
}

// --- Change calculation ---

function calcChangePct(current: number, historical: number | null): number | null {
  if (historical === null || historical === 0) return null
  return ((current - historical) / historical) * 100
}

async function getHistoricalPrice(assetId: string, daysAgo: number): Promise<number | null> {
  const targetDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('market_prices')
    .select('price')
    .eq('asset_id', assetId)
    .lte('recorded_at', targetDate)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  return data ? Number(data.price) : null
}

// --- AI Analysis ---

interface AIAnalysis {
  market_summary: string
  key_movers: Array<{ instrument: string; change: string; explanation: string }>
  geopolitical_watch: string
  week_ahead: string
}

async function generateAnalysis(
  priceData: Array<{ name: string; price: number; change_24h: number | null }>,
  news: string[],
  events: string[]
): Promise<AIAnalysis> {
  const priceLines = priceData
    .map(p => `${p.name}: $${p.price.toFixed(2)} (${p.change_24h !== null ? `${p.change_24h > 0 ? '+' : ''}${p.change_24h.toFixed(2)}%` : 'n/a'})`)
    .join('\n')

  const newsSection = news.length > 0 ? `\nRecent headlines:\n${news.slice(0, 20).map((n, i) => `${i + 1}. ${n}`).join('\n')}` : '\nNo recent news available.'
  const eventsSection = events.length > 0 ? `\nUpcoming economic events:\n${events.slice(0, 10).map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '\nNo upcoming events.'

  const response = await callLLM({
    tier: 'cheap',
    systemPrompt: `You are a financial market analyst. Given today's market data, news headlines, and upcoming events, produce a concise daily briefing. Output valid JSON only with this exact structure:
{
  "market_summary": "2-3 sentence overview of today's market conditions",
  "key_movers": [{"instrument": "name", "change": "+X.X%", "explanation": "why it moved"}],
  "geopolitical_watch": "1-2 sentences on active geopolitical risks and market implications",
  "week_ahead": "1-2 sentences on upcoming events that could move markets"
}
Keep key_movers to the top 5 biggest movers. Be concise and actionable.`,
    userPrompt: `Today's market prices:\n${priceLines}\n${newsSection}\n${eventsSection}`,
    maxTokens: 800,
    temperature: 0.3,
  })

  return parseLLMJson<AIAnalysis>(response.content, {
    market_summary: 'Analysis unavailable',
    key_movers: [],
    geopolitical_watch: 'No data',
    week_ahead: 'No data',
  })
}

// --- Main refresh handler ---

export async function GET() {
  const errors: string[] = []
  let pricesStored = 0
  let analysisStored = false

  try {
    // 1. Read enabled assets
    const { data: assets, error: assetsError } = await supabase
      .from('market_assets')
      .select('*')
      .eq('enabled', true)
      .returns<MarketAssetRow[]>()

    if (assetsError || !assets) {
      throw new Error(`Failed to read market_assets: ${assetsError?.message}`)
    }

    const capitalAssets = assets.filter(a => a.data_source === 'capital' && a.epic)
    const externalAssets = assets.filter(a => a.data_source === 'external' && a.yahoo_ticker)

    // 2-4. Fetch prices from both sources in parallel
    console.log(`[markets/refresh] Fetching prices for ${capitalAssets.length} Capital.com + ${externalAssets.length} Yahoo instruments`)

    const [capitalPrices, yahooPrices] = await Promise.allSettled([
      // Capital.com
      (async () => {
        const session = await createCapitalSession()
        console.log('[markets/refresh] Capital.com session created successfully')
        const epics = capitalAssets.map(a => a.epic!)
        return fetchCapitalPrices(session, epics)
      })(),
      // Yahoo Finance
      fetchYahooPrices(externalAssets.map(a => a.yahoo_ticker!)),
    ])

    const capPrices = capitalPrices.status === 'fulfilled' ? capitalPrices.value : new Map<string, number>()
    const yahPrices = yahooPrices.status === 'fulfilled' ? yahooPrices.value : new Map<string, number>()

    if (capitalPrices.status === 'rejected') {
      const reason = capitalPrices.reason instanceof Error ? capitalPrices.reason.message : String(capitalPrices.reason)
      console.error('[markets/refresh] Capital.com failed:', reason)
      errors.push(`Capital.com: ${reason}`)
    } else {
      console.log(`[markets/refresh] Capital.com returned ${capPrices.size} prices`)
    }
    if (yahooPrices.status === 'rejected') {
      const reason = yahooPrices.reason instanceof Error ? yahooPrices.reason.message : String(yahooPrices.reason)
      console.error('[markets/refresh] Yahoo failed:', reason)
      errors.push(`Yahoo Finance: ${reason}`)
    } else {
      console.log(`[markets/refresh] Yahoo returned ${yahPrices.size} prices`)
    }

    // 5-6. Calculate changes and upsert prices
    const priceDataForAnalysis: Array<{ name: string; price: number; change_24h: number | null }> = []
    const today = new Date().toISOString().split('T')[0]

    for (const asset of assets) {
      let price: number | undefined

      if (asset.data_source === 'capital' && asset.epic) {
        price = capPrices.get(asset.epic)
        if (!price) {
          errors.push(`No price for ${asset.symbol} (epic: ${asset.epic})`)
        }
      } else if (asset.data_source === 'external' && asset.yahoo_ticker) {
        price = yahPrices.get(asset.yahoo_ticker)
        if (!price) {
          errors.push(`No price for ${asset.symbol} (ticker: ${asset.yahoo_ticker})`)
        }
      }

      if (!price) continue

      // Get historical prices for change calculation
      const [hist1d, hist7d, hist90d] = await Promise.all([
        getHistoricalPrice(asset.id, 1),
        getHistoricalPrice(asset.id, 7),
        getHistoricalPrice(asset.id, 90),
      ])

      const change24h = calcChangePct(price, hist1d)
      const change1w = calcChangePct(price, hist7d)
      const change1q = calcChangePct(price, hist90d)

      // Upsert on (asset_id, price_date) — idempotent for same-day refreshes
      const { error: upsertError } = await supabase
        .from('market_prices')
        .upsert({
          asset_id: asset.id,
          price,
          change_24h_pct: change24h,
          change_1w_pct: change1w,
          change_1q_pct: change1q,
          price_date: today,
          recorded_at: new Date().toISOString(),
        }, {
          onConflict: 'asset_id,price_date',
        })

      if (upsertError) {
        errors.push(`Price store failed for ${asset.symbol}: ${upsertError.message}`)
        continue
      }

      pricesStored++
      priceDataForAnalysis.push({ name: asset.name, price, change_24h: change24h })
    }

    // 7. Read context data for AI
    const [newsResult, eventsResult, geoNewsResult] = await Promise.all([
      supabase
        .from('news_sentiment')
        .select('instrument, score, headlines')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('economic_events')
        .select('event_name, country, impact, event_time')
        .gte('event_time', new Date().toISOString())
        .order('event_time', { ascending: true })
        .limit(10),
      supabase
        .from('news_cache')
        .select('title')
        .eq('category', 'geopolitical')
        .order('fetched_at', { ascending: false })
        .limit(15),
    ])

    // Flatten news headlines
    const newsHeadlines: string[] = []
    for (const row of newsResult.data ?? []) {
      const headlines = row.headlines as string[] | null
      if (headlines) {
        newsHeadlines.push(...headlines.slice(0, 5))
      }
    }
    // Add geopolitical headlines
    for (const row of geoNewsResult.data ?? []) {
      newsHeadlines.push(row.title)
    }

    const eventLines = (eventsResult.data ?? []).map(
      (e: { event_name: string; country: string; impact: string; event_time: string }) =>
        `${e.event_name} (${e.country}, ${e.impact}) — ${e.event_time}`
    )

    // 8-9. Generate and store AI analysis
    if (priceDataForAnalysis.length > 0) {
      try {
        const analysis = await generateAnalysis(priceDataForAnalysis, newsHeadlines, eventLines)

        const { error: analysisError } = await supabase
          .from('market_analyses')
          .upsert({
            analysis_date: today,
            market_summary: analysis.market_summary,
            key_movers: analysis.key_movers,
            geopolitical_watch: analysis.geopolitical_watch,
            week_ahead: analysis.week_ahead,
            raw_data: analysis,
          }, {
            onConflict: 'analysis_date',
          })

        if (analysisError) {
          errors.push(`Analysis store failed: ${analysisError.message}`)
        } else {
          analysisStored = true
        }
      } catch (aiError) {
        errors.push(`AI analysis failed: ${aiError instanceof Error ? aiError.message : 'Unknown'}`)
      }
    }

    // Log result
    const summary = `Markets refresh: ${pricesStored}/${assets.length} prices stored, AI analysis: ${analysisStored ? 'yes' : 'no'}${errors.length > 0 ? `. Errors: ${errors.length}` : ''}`
    await logCron('markets-refresh', summary, errors.length === 0)

    return NextResponse.json({
      success: true,
      prices_stored: pricesStored,
      total_assets: assets.length,
      analysis: analysisStored,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    const msg = `Markets refresh failed: ${error instanceof Error ? error.message : 'Unknown'}`
    await logCron('markets-refresh', msg, false).catch(() => {})
    console.error('[api/markets/refresh] Error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
