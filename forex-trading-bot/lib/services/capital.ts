/**
 * Capital.com REST API Client
 *
 * Replaces OANDA v20. Uses session-based auth (CST + X-SECURITY-TOKEN).
 * Keeps OANDA-style instrument names internally, translates at API boundary.
 *
 * API docs: https://open-api.capital.com/
 */

const CAPITAL_BASE_URL = (process.env.CAPITAL_BASE_URL || 'https://demo-api-capital.backend-capital.com').replace(/\/+$/, '')
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY
const CAPITAL_IDENTIFIER = process.env.CAPITAL_IDENTIFIER
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD

// --- Session Management ---

let sessionCST: string | null = null
let sessionToken: string | null = null
let sessionTimestamp = 0
const SESSION_TTL_MS = 9 * 60 * 1000 // 9 minutes (server timeout is 10 min)

async function ensureSession(): Promise<void> {
  if (sessionCST && sessionToken && Date.now() - sessionTimestamp < SESSION_TTL_MS) {
    return // Session still valid
  }

  if (!CAPITAL_API_KEY || !CAPITAL_IDENTIFIER || !CAPITAL_PASSWORD) {
    throw new Error('Missing Capital.com credentials (CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD)')
  }

  let response: Response
  try {
    response = await fetch(`${CAPITAL_BASE_URL}/api/v1/session`, {
      method: 'POST',
      headers: {
        'X-CAP-API-KEY': CAPITAL_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: CAPITAL_IDENTIFIER,
        password: CAPITAL_PASSWORD,
      }),
    })
  } catch (error) {
    throw new Error(`Capital.com auth network error: ${error instanceof Error ? error.message : 'Connection failed'}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => 'Unable to read error')
    throw new Error(`Capital.com auth failed ${response.status}: ${body}`)
  }

  sessionCST = response.headers.get('CST')
  sessionToken = response.headers.get('X-SECURITY-TOKEN')

  if (!sessionCST || !sessionToken) {
    throw new Error('Capital.com auth response missing CST or X-SECURITY-TOKEN headers')
  }

  sessionTimestamp = Date.now()
}

function getAuthHeaders(): Record<string, string> {
  if (!sessionCST || !sessionToken) {
    throw new Error('Capital.com session not initialized — call ensureSession() first')
  }
  return {
    'X-SECURITY-TOKEN': sessionToken,
    'CST': sessionCST,
    'Content-Type': 'application/json',
  }
}

async function capitalFetch<T>(path: string, options?: RequestInit): Promise<T> {
  await ensureSession()

  const url = `${CAPITAL_BASE_URL}${path}`
  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      headers: { ...getAuthHeaders(), ...options?.headers },
    })
  } catch (error) {
    throw new Error(`Capital.com API network error: ${error instanceof Error ? error.message : 'Connection failed'}`)
  }

  if (!response.ok) {
    let errorBody: string
    try {
      errorBody = await response.text()
    } catch {
      errorBody = 'Unable to read error response'
    }

    // If 401, clear session so next call re-authenticates
    if (response.status === 401) {
      sessionCST = null
      sessionToken = null
      sessionTimestamp = 0
    }

    throw new Error(`Capital.com API error ${response.status}: ${errorBody}`)
  }

  const text = await response.text()
  if (!text) return {} as T
  return JSON.parse(text) as T
}

// --- Instrument Translation ---
// Internal: OANDA-style 'EUR_USD', 'XAU_USD'
// Capital.com: 'EURUSD', 'GOLD'

const EPIC_MAP: Record<string, string> = {
  // Original 6 instruments
  EUR_USD: 'EURUSD',
  USD_JPY: 'USDJPY',
  XAU_USD: 'GOLD',
  BCO_USD: 'OIL_CRUDE',
  EUR_GBP: 'EURGBP',
  US30_USD: 'US30',
  // Added 2026-04-03 — expand universe for more trade opportunities
  // (see _bmad-output/analysis/trade-frequency-report.md, Win 4)
  AUD_USD: 'AUDUSD',
  GBP_USD: 'GBPUSD',
  NZD_USD: 'NZDUSD',
  XAG_USD: 'SILVER',
  US500_USD: 'US500',
  GER40_EUR: 'DE40',
}

const REVERSE_EPIC_MAP: Record<string, string> = {}
for (const [oanda, epic] of Object.entries(EPIC_MAP)) {
  REVERSE_EPIC_MAP[epic] = oanda
}

function toEpic(instrument: string): string {
  return EPIC_MAP[instrument] ?? instrument
}

function fromEpic(epic: string): string {
  return REVERSE_EPIC_MAP[epic] ?? epic
}

// --- Granularity Translation ---
// Internal: 'H4', 'H1', 'D'
// Capital.com: 'HOUR_4', 'HOUR', 'DAY'

const GRANULARITY_MAP: Record<string, string> = {
  M1: 'MINUTE',
  M5: 'MINUTE_5',
  M15: 'MINUTE_15',
  M30: 'MINUTE_30',
  H1: 'HOUR',
  H4: 'HOUR_4',
  D: 'DAY',
  W: 'WEEK',
}

function toResolution(granularity: string): string {
  return GRANULARITY_MAP[granularity] ?? granularity
}

// --- Types (same shape as oanda.ts exports) ---

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

// --- Capital.com raw response types ---

interface CapitalPriceCandle {
  snapshotTime: string
  snapshotTimeUTC: string
  openPrice: { bid: number; ask: number }
  closePrice: { bid: number; ask: number }
  highPrice: { bid: number; ask: number }
  lowPrice: { bid: number; ask: number }
  lastTradedVolume: number
}

interface CapitalPosition {
  position: {
    dealId: string
    direction: 'BUY' | 'SELL'
    size: number
    level: number
    stopLevel: number | null
    limitLevel: number | null
    upl: number
    createdDateUTC: string
  }
  market: {
    epic: string
    instrumentName: string
    bid: number
    offer: number
  }
}

interface CapitalAccount {
  accountId: string
  accountName: string
  balance: { balance: number; deposit: number; profitLoss: number; available: number }
}

interface CapitalDealConfirmation {
  dealId: string
  dealStatus: string
  direction: string
  epic: string
  size: number
  level: number
  stopLevel: number | null
  limitLevel: number | null
  dealReference: string
  affectedDeals: Array<{ dealId: string; status: string }>
}

// --- API Methods (same signatures as oanda.ts) ---

export async function fetchCandles(
  instrument: string,
  granularity: string,
  count: number
): Promise<OandaCandle[]> {
  const epic = toEpic(instrument)
  const resolution = toResolution(granularity)

  const data = await capitalFetch<{ prices: CapitalPriceCandle[] }>(
    `/api/v1/prices/${epic}?resolution=${resolution}&max=${count}`
  )

  return (data.prices ?? []).map(candle => {
    const midOpen = (candle.openPrice.bid + candle.openPrice.ask) / 2
    const midHigh = (candle.highPrice.bid + candle.highPrice.ask) / 2
    const midLow = (candle.lowPrice.bid + candle.lowPrice.ask) / 2
    const midClose = (candle.closePrice.bid + candle.closePrice.ask) / 2

    return {
      time: candle.snapshotTimeUTC || candle.snapshotTime,
      volume: candle.lastTradedVolume,
      mid: {
        o: midOpen.toString(),
        h: midHigh.toString(),
        l: midLow.toString(),
        c: midClose.toString(),
      },
      complete: true, // Capital.com only returns complete candles in historical
    }
  })
}

export async function getAccountSummary(): Promise<OandaAccountSummary['account']> {
  const data = await capitalFetch<{ accounts: CapitalAccount[] }>('/api/v1/accounts')

  const account = data.accounts?.[0]
  if (!account) {
    throw new Error('No Capital.com accounts found')
  }

  // Get open positions count
  const positions = await capitalFetch<{ positions: CapitalPosition[] }>('/api/v1/positions')
  const openCount = positions.positions?.length ?? 0

  return {
    id: account.accountId,
    balance: account.balance.balance.toString(),
    unrealizedPL: account.balance.profitLoss.toString(),
    pl: account.balance.profitLoss.toString(),
    openTradeCount: openCount,
    marginUsed: (account.balance.balance - account.balance.available).toString(),
    marginAvailable: account.balance.available.toString(),
    NAV: (account.balance.balance + account.balance.profitLoss).toString(),
  }
}

export async function placeMarketOrder(
  instrument: string,
  units: number,
  stopLoss: number
): Promise<OandaOrderResponse> {
  const epic = toEpic(instrument)
  const direction = units > 0 ? 'BUY' : 'SELL'
  const size = Math.abs(units)

  // Step 1: Create position
  const orderResult = await capitalFetch<{ dealReference: string }>(
    '/api/v1/positions',
    {
      method: 'POST',
      body: JSON.stringify({
        epic,
        direction,
        size,
        guaranteedStop: false,
        stopLevel: stopLoss,
      }),
    }
  )

  if (!orderResult.dealReference) {
    throw new Error('Capital.com order failed: no dealReference returned')
  }

  // Step 2: Confirm deal to get dealId and fill price
  // Small delay to allow order processing
  await new Promise(resolve => setTimeout(resolve, 500))

  const confirmation = await capitalFetch<CapitalDealConfirmation>(
    `/api/v1/confirms/${orderResult.dealReference}`
  )

  if (confirmation.dealStatus !== 'ACCEPTED') {
    throw new Error(`Capital.com order rejected: ${confirmation.dealStatus}`)
  }

  return {
    orderCreateTransaction: {
      id: confirmation.dealReference,
      type: 'MARKET',
      instrument,
      units: String(units),
    },
    orderFillTransaction: {
      id: confirmation.dealId,
      tradeOpened: {
        tradeID: confirmation.dealId,
        units: String(units),
      },
      price: confirmation.level.toString(),
    },
    relatedTransactionIDs: [confirmation.dealReference, confirmation.dealId],
  }
}

export async function closePosition(tradeId: string): Promise<OandaOrderResponse> {
  const result = await capitalFetch<{ dealReference: string }>(
    `/api/v1/positions/${tradeId}`,
    { method: 'DELETE' }
  )

  return {
    orderFillTransaction: {
      id: tradeId,
      price: '0', // Actual close price available via confirms endpoint
    },
    relatedTransactionIDs: [result.dealReference ?? tradeId],
  }
}

export async function getOpenPositions(): Promise<OandaPosition[]> {
  const data = await capitalFetch<{ positions: CapitalPosition[] }>('/api/v1/positions')

  return (data.positions ?? []).map(p => {
    const instrument = fromEpic(p.market.epic)
    const isLong = p.position.direction === 'BUY'
    const units = isLong ? p.position.size.toString() : `-${p.position.size}`
    const price = p.position.level.toString()

    return {
      instrument,
      long: {
        units: isLong ? units : '0',
        averagePrice: isLong ? price : undefined,
        unrealizedPL: isLong ? p.position.upl.toString() : '0',
        tradeIDs: isLong ? [p.position.dealId] : [],
      },
      short: {
        units: isLong ? '0' : Math.abs(p.position.size).toString(),
        averagePrice: isLong ? undefined : price,
        unrealizedPL: isLong ? '0' : p.position.upl.toString(),
        tradeIDs: isLong ? [] : [p.position.dealId],
      },
    }
  })
}

export async function getOpenTrades(): Promise<OandaTrade[]> {
  const data = await capitalFetch<{ positions: CapitalPosition[] }>('/api/v1/positions')

  return (data.positions ?? []).map(p => {
    const instrument = fromEpic(p.market.epic)
    const isLong = p.position.direction === 'BUY'
    const units = isLong ? p.position.size : -p.position.size

    return {
      id: p.position.dealId,
      instrument,
      currentUnits: units.toString(),
      price: p.position.level.toString(),
      unrealizedPL: p.position.upl.toString(),
      state: 'OPEN',
      openTime: p.position.createdDateUTC,
      stopLossOrder: p.position.stopLevel
        ? { price: p.position.stopLevel.toString() }
        : undefined,
    }
  })
}

// --- Broker position data for reconciliation and stop verification ---

export interface BrokerPosition {
  dealId: string
  instrument: string
  direction: 'BUY' | 'SELL'
  size: number
  entryLevel: number
  stopLevel: number | null
  limitLevel: number | null
  upl: number
  createdDateUTC: string
  currentBid: number
  currentOffer: number
}

export async function getBrokerPositions(): Promise<BrokerPosition[]> {
  const data = await capitalFetch<{ positions: CapitalPosition[] }>('/api/v1/positions')

  return (data.positions ?? []).map(p => ({
    dealId: p.position.dealId,
    instrument: fromEpic(p.market.epic),
    direction: p.position.direction,
    size: p.position.size,
    entryLevel: p.position.level,
    stopLevel: p.position.stopLevel,
    limitLevel: p.position.limitLevel,
    upl: p.position.upl,
    createdDateUTC: p.position.createdDateUTC,
    currentBid: p.market.bid,
    currentOffer: p.market.offer,
  }))
}

export async function modifyTradeStopLoss(
  tradeId: string,
  stopLossPrice: number
): Promise<void> {
  await capitalFetch(
    `/api/v1/positions/${tradeId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        stopLevel: stopLossPrice,
      }),
    }
  )
}
