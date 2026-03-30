/**
 * OANDA v20 REST API Client
 *
 * Uses native fetch. All methods throw descriptive errors on failure.
 * Instrument format: 'XAU_USD' (underscore, not slash).
 */

const OANDA_BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com/v3'
const OANDA_API_KEY = process.env.OANDA_API_KEY
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID

function getHeaders(): Record<string, string> {
  if (!OANDA_API_KEY) {
    throw new Error('OANDA_API_KEY environment variable is not set')
  }
  return {
    'Authorization': `Bearer ${OANDA_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Datetime-Format': 'RFC3339',
  }
}

function getAccountId(): string {
  if (!OANDA_ACCOUNT_ID) {
    throw new Error('OANDA_ACCOUNT_ID environment variable is not set')
  }
  return OANDA_ACCOUNT_ID
}

async function oandaFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${OANDA_BASE_URL}${path}`
  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options?.headers },
    })
  } catch (error) {
    throw new Error(
      `OANDA API network error: ${error instanceof Error ? error.message : 'Connection failed'}`
    )
  }

  if (!response.ok) {
    let errorBody: string
    try {
      errorBody = await response.text()
    } catch {
      errorBody = 'Unable to read error response'
    }
    throw new Error(
      `OANDA API error ${response.status}: ${errorBody}`
    )
  }

  return response.json() as Promise<T>
}

// --- Types ---

export interface OandaCandle {
  time: string
  volume: number
  mid: {
    o: string
    h: string
    l: string
    c: string
  }
  complete: boolean
}

export interface OandaCandlesResponse {
  instrument: string
  granularity: string
  candles: OandaCandle[]
}

export interface OandaAccountSummary {
  account: {
    id: string
    balance: string
    unrealizedPL: string
    pl: string
    openTradeCount: number
    marginUsed: string
    marginAvailable: string
    NAV: string
  }
}

export interface OandaOrderResponse {
  orderCreateTransaction?: {
    id: string
    type: string
    instrument: string
    units: string
  }
  orderFillTransaction?: {
    id: string
    tradeOpened?: {
      tradeID: string
      units: string
    }
    price: string
  }
  relatedTransactionIDs: string[]
}

export interface OandaPosition {
  instrument: string
  long: {
    units: string
    averagePrice?: string
    unrealizedPL: string
    tradeIDs?: string[]
  }
  short: {
    units: string
    averagePrice?: string
    unrealizedPL: string
    tradeIDs?: string[]
  }
}

export interface OandaTrade {
  id: string
  instrument: string
  currentUnits: string
  price: string
  unrealizedPL: string
  state: string
  openTime: string
  stopLossOrder?: {
    price: string
  }
}

// --- API Methods ---

export async function fetchCandles(
  instrument: string,
  granularity: string,
  count: number
): Promise<OandaCandle[]> {
  const data = await oandaFetch<OandaCandlesResponse>(
    `/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`
  )
  return data.candles
}

export async function getAccountSummary(): Promise<OandaAccountSummary['account']> {
  const data = await oandaFetch<OandaAccountSummary>(
    `/accounts/${getAccountId()}/summary`
  )
  return data.account
}

export async function placeMarketOrder(
  instrument: string,
  units: number,
  stopLoss: number
): Promise<OandaOrderResponse> {
  return oandaFetch<OandaOrderResponse>(
    `/accounts/${getAccountId()}/orders`,
    {
      method: 'POST',
      body: JSON.stringify({
        order: {
          type: 'MARKET',
          instrument,
          units: String(units),
          timeInForce: 'FOK',
          stopLossOnFill: {
            price: stopLoss.toFixed(5),
            timeInForce: 'GTC',
          },
        },
      }),
    }
  )
}

export async function closePosition(tradeId: string): Promise<OandaOrderResponse> {
  return oandaFetch<OandaOrderResponse>(
    `/accounts/${getAccountId()}/trades/${tradeId}/close`,
    { method: 'PUT' }
  )
}

export async function getOpenPositions(): Promise<OandaPosition[]> {
  const data = await oandaFetch<{ positions: OandaPosition[] }>(
    `/accounts/${getAccountId()}/openPositions`
  )
  return data.positions
}

export async function getOpenTrades(): Promise<OandaTrade[]> {
  const data = await oandaFetch<{ trades: OandaTrade[] }>(
    `/accounts/${getAccountId()}/openTrades`
  )
  return data.trades
}

export async function modifyTradeStopLoss(
  tradeId: string,
  stopLossPrice: number
): Promise<void> {
  await oandaFetch(
    `/accounts/${getAccountId()}/trades/${tradeId}/orders`,
    {
      method: 'PUT',
      body: JSON.stringify({
        stopLoss: {
          price: stopLossPrice.toFixed(5),
          timeInForce: 'GTC',
        },
      }),
    }
  )
}
