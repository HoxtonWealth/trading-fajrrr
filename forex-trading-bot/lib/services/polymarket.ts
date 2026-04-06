/**
 * Polymarket API Client — free read API, no auth required.
 * Rate limit: 4000 requests per 10 seconds.
 *
 * Note: gamma-api.polymarket.com may be geo-blocked outside the US.
 * Vercel (US-east) should still be able to reach it. If not, polls
 * return null and the system falls back to Kalshi-only data.
 */

const POLYMARKET_BASE_URL = 'https://gamma-api.polymarket.com'
const FETCH_TIMEOUT = 8000 // 8s — fail fast if geo-blocked

export interface PolymarketPrice {
  probability: number
  volume: number
  question: string
  slug: string
}

export async function fetchMarketBySlug(slug: string): Promise<PolymarketPrice | null> {
  try {
    const response = await fetch(`${POLYMARKET_BASE_URL}/markets?slug=${slug}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!response.ok) {
      console.error(`[polymarket] API error ${response.status} for slug: ${slug}`)
      return null
    }

    const data = await response.json() as Array<{
      question: string
      slug: string
      outcomePrices: string
      volume: string
      active: boolean
    }>
    if (!data || data.length === 0) return null

    const market = data[0]
    const prices = JSON.parse(market.outcomePrices || '[]') as string[]
    const yesPrice = prices.length > 0 ? parseFloat(prices[0]) : 0

    return {
      probability: yesPrice,
      volume: parseFloat(market.volume || '0'),
      question: market.question,
      slug: market.slug,
    }
  } catch (error) {
    // Fail silently — geo-blocking or network issue; Kalshi carries the load
    console.error(`[polymarket] Failed to fetch ${slug}:`, error instanceof Error ? error.message : error)
    return null
  }
}
