const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

export interface FinnhubNews {
  id: number
  headline: string
  summary: string
  source: string
  datetime: number
  category: string
  related: string
  url: string
}

/**
 * Fetch news from multiple Finnhub categories for broader coverage.
 * Free tier returns general market news — fetching multiple categories
 * increases the chance of matching instrument-specific keywords.
 */
export async function fetchForexNews(): Promise<FinnhubNews[]> {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY environment variable is not set')
  }

  const categories = ['forex', 'general', 'merger']
  const allNews: FinnhubNews[] = []
  const seen = new Set<number>()

  for (const category of categories) {
    try {
      const response = await fetch(
        `${FINNHUB_BASE_URL}/news?category=${category}&token=${FINNHUB_API_KEY}`
      )
      if (!response.ok) continue
      const articles = await response.json() as FinnhubNews[]
      for (const a of articles) {
        if (!seen.has(a.id)) {
          seen.add(a.id)
          allNews.push(a)
        }
      }
    } catch {
      // Continue with remaining categories
    }
  }

  return allNews
}
