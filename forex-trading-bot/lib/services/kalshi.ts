/**
 * Kalshi API Client — free read API, no auth required for public markets.
 * Rate limit: 20 requests per second.
 *
 * Field names use "_dollars" suffix (strings) since the 2025 API update.
 */

const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2'

interface KalshiMarketRaw {
  ticker: string
  title: string
  status: string
  yes_bid_dollars: string
  yes_ask_dollars: string
  no_bid_dollars: string
  no_ask_dollars: string
  last_price_dollars: string
  volume_fp: string
  open_interest_fp: string
}

export interface KalshiPrice {
  probability: number
  volume: number
  ticker: string
  title: string
}

function parseKalshiMarket(m: KalshiMarketRaw): KalshiPrice {
  const lastPrice = parseFloat(m.last_price_dollars || '0')
  const yesBid = parseFloat(m.yes_bid_dollars || '0')
  const yesAsk = parseFloat(m.yes_ask_dollars || '0')

  // last_price_dollars is already in 0-1 range (dollars, not cents)
  const probability = lastPrice > 0
    ? lastPrice
    : (yesBid + yesAsk) / 2

  return {
    probability,
    volume: parseFloat(m.volume_fp || '0'),
    ticker: m.ticker,
    title: m.title,
  }
}

export async function fetchKalshiMarket(ticker: string): Promise<KalshiPrice | null> {
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/markets/${ticker}`)

    if (!response.ok) {
      console.error(`[kalshi] API error ${response.status} for ticker: ${ticker}`)
      return null
    }

    const data = await response.json() as { market: KalshiMarketRaw }
    if (!data.market) return null

    return parseKalshiMarket(data.market)
  } catch (error) {
    console.error(`[kalshi] Failed to fetch ${ticker}:`, error)
    return null
  }
}

export async function fetchKalshiSeries(seriesTicker: string): Promise<KalshiPrice[]> {
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/markets?series_ticker=${seriesTicker}&status=open`)

    if (!response.ok) return []

    const data = await response.json() as { markets: KalshiMarketRaw[] }

    return (data.markets ?? []).map(parseKalshiMarket)
  } catch (error) {
    console.error(`[kalshi] Failed to fetch series ${seriesTicker}:`, error)
    return []
  }
}
