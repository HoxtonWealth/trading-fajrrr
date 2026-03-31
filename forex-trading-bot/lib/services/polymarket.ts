/**
 * Polymarket API Client — free read API, no auth required.
 * Rate limit: 4000 requests per 10 seconds.
 */

const POLYMARKET_BASE_URL = 'https://gamma-api.polymarket.com'

export interface PolymarketMarket {
  id: string
  question: string
  slug: string
  outcomePrices: string // JSON string of prices
  volume: string
  active: boolean
  closed: boolean
}

export interface PolymarketPrice {
  probability: number
  volume: number
  question: string
  slug: string
}

export async function fetchMarketBySlug(slug: string): Promise<PolymarketPrice | null> {
  try {
    const response = await fetch(`${POLYMARKET_BASE_URL}/markets?slug=${slug}`)

    if (!response.ok) {
      console.error(`[polymarket] API error ${response.status} for slug: ${slug}`)
      return null
    }

    const data = await response.json() as PolymarketMarket[]
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
    console.error(`[polymarket] Failed to fetch ${slug}:`, error)
    return null
  }
}

export async function fetchMarketById(marketId: string): Promise<PolymarketPrice | null> {
  try {
    const response = await fetch(`${POLYMARKET_BASE_URL}/markets/${marketId}`)

    if (!response.ok) return null

    const market = await response.json() as PolymarketMarket
    const prices = JSON.parse(market.outcomePrices || '[]') as string[]
    const yesPrice = prices.length > 0 ? parseFloat(prices[0]) : 0

    return {
      probability: yesPrice,
      volume: parseFloat(market.volume || '0'),
      question: market.question,
      slug: market.slug,
    }
  } catch (error) {
    console.error(`[polymarket] Failed to fetch market ${marketId}:`, error)
    return null
  }
}
