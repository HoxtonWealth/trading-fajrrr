/**
 * Kalshi API Client — free read API, no auth required for public markets.
 * Rate limit: 20 requests per second.
 */

const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2'

export interface KalshiMarket {
  ticker: string
  title: string
  status: string
  yes_bid: number
  yes_ask: number
  no_bid: number
  no_ask: number
  last_price: number
  volume: number
  open_interest: number
}

export interface KalshiPrice {
  probability: number
  volume: number
  ticker: string
  title: string
}

export async function fetchKalshiMarket(ticker: string): Promise<KalshiPrice | null> {
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/markets/${ticker}`)

    if (!response.ok) {
      console.error(`[kalshi] API error ${response.status} for ticker: ${ticker}`)
      return null
    }

    const data = await response.json() as { market: KalshiMarket }
    const market = data.market

    if (!market) return null

    // Probability = midpoint of yes bid/ask, or last price
    const probability = market.last_price > 0
      ? market.last_price / 100
      : (market.yes_bid + market.yes_ask) / 200

    return {
      probability,
      volume: market.volume,
      ticker: market.ticker,
      title: market.title,
    }
  } catch (error) {
    console.error(`[kalshi] Failed to fetch ${ticker}:`, error)
    return null
  }
}

export async function fetchKalshiSeries(seriesTicker: string): Promise<KalshiPrice[]> {
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/markets?series_ticker=${seriesTicker}&status=open`)

    if (!response.ok) return []

    const data = await response.json() as { markets: KalshiMarket[] }

    return (data.markets ?? []).map(m => ({
      probability: m.last_price > 0 ? m.last_price / 100 : (m.yes_bid + m.yes_ask) / 200,
      volume: m.volume,
      ticker: m.ticker,
      title: m.title,
    }))
  } catch (error) {
    console.error(`[kalshi] Failed to fetch series ${seriesTicker}:`, error)
    return []
  }
}
