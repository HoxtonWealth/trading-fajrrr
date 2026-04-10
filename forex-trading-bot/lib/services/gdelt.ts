/**
 * GDELT API Client
 *
 * Fetches geopolitical news headlines from the GDELT Project.
 * Free API, no key required.
 */

const GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'

interface GdeltArticle {
  title: string
  url: string
  source: string
  seendate: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

const GEOPOLITICAL_QUERIES = [
  'sanctions OR "trade war" OR tariff',
  'military OR conflict OR war OR invasion',
  'election OR "regime change" OR coup',
  'OPEC OR "energy crisis" OR pipeline',
]

async function queryGdelt(query: string, maxRecords = 25): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: String(maxRecords),
    format: 'json',
    timespan: '24h',
    sort: 'DateDesc',
  })

  const response = await fetch(`${GDELT_BASE_URL}?${params}`, {
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`GDELT API error ${response.status}`)
  }

  const data = (await response.json()) as GdeltResponse
  return data.articles ?? []
}

export interface GeopoliticalArticle {
  title: string
  url: string
  source: string
  published_at: string
}

export async function fetchGeopoliticalNews(): Promise<GeopoliticalArticle[]> {
  const allArticles: GeopoliticalArticle[] = []

  for (let i = 0; i < GEOPOLITICAL_QUERIES.length; i++) {
    const query = GEOPOLITICAL_QUERIES[i]
    // GDELT rate limit: 1 request per second (5.5s was overly conservative)
    if (i > 0) await new Promise(r => setTimeout(r, 2000))
    try {
      const articles = await queryGdelt(query)
      for (const a of articles) {
        allArticles.push({
          title: a.title,
          url: a.url,
          source: a.source || 'GDELT',
          published_at: parseGdeltDate(a.seendate),
        })
      }
    } catch (error) {
      console.error(`[gdelt] Query failed: "${query}":`, error instanceof Error ? error.message : error)
      // Continue with remaining queries
    }
  }

  return deduplicateArticles(allArticles)
}

function parseGdeltDate(seendate: string): string {
  // GDELT dates are like "20260401T120000Z"
  if (seendate.length >= 15) {
    const y = seendate.slice(0, 4)
    const m = seendate.slice(4, 6)
    const d = seendate.slice(6, 8)
    const h = seendate.slice(9, 11)
    const mi = seendate.slice(11, 13)
    const s = seendate.slice(13, 15)
    return `${y}-${m}-${d}T${h}:${mi}:${s}Z`
  }
  return new Date().toISOString()
}

function deduplicateArticles(articles: GeopoliticalArticle[]): GeopoliticalArticle[] {
  const seen = new Set<string>()
  return articles.filter(a => {
    const key = a.title.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const INSTRUMENT_GDELT_QUERIES: Record<string, string> = {
  XAU_USD: 'gold price geopolitics war sanctions',
  EUR_USD: 'eurozone economy ECB policy',
  USD_JPY: 'japan yen BOJ monetary policy',
  BCO_USD: 'oil price OPEC supply demand',
  US30_USD: 'US economy stocks fed policy',
  EUR_GBP: 'UK economy sterling Brexit BOE',
  // Added 2026-04-03 — new instruments (Win 4)
  AUD_USD: 'australia economy RBA commodity iron ore',
  GBP_USD: 'UK economy BOE sterling interest rate',
  NZD_USD: 'new zealand economy RBNZ dairy commodity',
  XAG_USD: 'silver price industrial metals demand',
  US500_USD: 'US stocks SP500 earnings fed policy',
  GER40_EUR: 'germany economy ECB DAX manufacturing',
}

export async function getGeopoliticalSentiment(instrument: string): Promise<{
  articles: GeopoliticalArticle[]
  articleCount: number
}> {
  const query = INSTRUMENT_GDELT_QUERIES[instrument] ?? 'forex currency central bank'

  try {
    const articles = await queryGdelt(query, 15)
    return {
      articles: articles.map(a => ({
        title: a.title,
        url: a.url,
        source: a.source || 'GDELT',
        published_at: parseGdeltDate(a.seendate),
      })),
      articleCount: articles.length,
    }
  } catch {
    return { articles: [], articleCount: 0 }
  }
}
