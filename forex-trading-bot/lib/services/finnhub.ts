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

export async function fetchForexNews(category: string = 'forex'): Promise<FinnhubNews[]> {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY environment variable is not set')
  }

  const response = await fetch(
    `${FINNHUB_BASE_URL}/news?category=${category}&token=${FINNHUB_API_KEY}`
  )

  if (!response.ok) {
    throw new Error(`Finnhub API error ${response.status}: ${await response.text()}`)
  }

  return response.json() as Promise<FinnhubNews[]>
}
