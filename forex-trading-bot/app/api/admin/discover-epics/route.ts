/**
 * Temporary admin endpoint — Capital.com epic discovery for the 50-instrument expansion.
 *
 * For each candidate instrument, does two things:
 *  1. Directly fetches `/api/v1/markets/{expectedEpic}` to verify the epic resolves
 *  2. Calls `/api/v1/markets?searchTerm={term}` to see what Capital.com offers
 *
 * Returns a JSON report we use to build the final EPIC_MAP.
 *
 * DELETE THIS FILE after the 50-instrument migration lands.
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'

const CAPITAL_BASE_URL = (process.env.CAPITAL_BASE_URL || 'https://demo-api-capital.backend-capital.com').replace(/\/+$/, '')
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY
const CAPITAL_IDENTIFIER = process.env.CAPITAL_IDENTIFIER
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD

interface CapitalSession {
  cst: string
  securityToken: string
}

async function createSession(): Promise<CapitalSession> {
  if (!CAPITAL_API_KEY || !CAPITAL_IDENTIFIER || !CAPITAL_PASSWORD) {
    throw new Error('Missing Capital.com credentials (CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_PASSWORD)')
  }

  const res = await fetch(`${CAPITAL_BASE_URL}/api/v1/session`, {
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

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Capital.com auth failed ${res.status}: ${body}`)
  }

  const cst = res.headers.get('CST')
  const securityToken = res.headers.get('X-SECURITY-TOKEN')
  if (!cst || !securityToken) throw new Error('Capital.com auth missing CST / X-SECURITY-TOKEN')
  return { cst, securityToken }
}

interface Candidate {
  internalName: string
  expectedEpic: string
  searchTerm: string
  category: 'currencies' | 'equities' | 'commodities' | 'crypto' | 'bonds'
  displayName: string
}

// The confirmed candidate list of 50 instruments.
// Uses trading-bot-native names where they differ from the task description
// (US500_USD instead of SPX500_USD, GER40_EUR instead of DE30_EUR).
const CANDIDATES: Candidate[] = [
  // --- Forex (15) ---
  { internalName: 'EUR_USD', expectedEpic: 'EURUSD', searchTerm: 'EURUSD', category: 'currencies', displayName: 'EUR/USD' },
  { internalName: 'USD_JPY', expectedEpic: 'USDJPY', searchTerm: 'USDJPY', category: 'currencies', displayName: 'USD/JPY' },
  { internalName: 'EUR_GBP', expectedEpic: 'EURGBP', searchTerm: 'EURGBP', category: 'currencies', displayName: 'EUR/GBP' },
  { internalName: 'AUD_USD', expectedEpic: 'AUDUSD', searchTerm: 'AUDUSD', category: 'currencies', displayName: 'AUD/USD' },
  { internalName: 'GBP_USD', expectedEpic: 'GBPUSD', searchTerm: 'GBPUSD', category: 'currencies', displayName: 'GBP/USD' },
  { internalName: 'NZD_USD', expectedEpic: 'NZDUSD', searchTerm: 'NZDUSD', category: 'currencies', displayName: 'NZD/USD' },
  { internalName: 'USD_CHF', expectedEpic: 'USDCHF', searchTerm: 'USDCHF', category: 'currencies', displayName: 'USD/CHF' },
  { internalName: 'USD_CAD', expectedEpic: 'USDCAD', searchTerm: 'USDCAD', category: 'currencies', displayName: 'USD/CAD' },
  { internalName: 'EUR_JPY', expectedEpic: 'EURJPY', searchTerm: 'EURJPY', category: 'currencies', displayName: 'EUR/JPY' },
  { internalName: 'EUR_AUD', expectedEpic: 'EURAUD', searchTerm: 'EURAUD', category: 'currencies', displayName: 'EUR/AUD' },
  { internalName: 'EUR_CHF', expectedEpic: 'EURCHF', searchTerm: 'EURCHF', category: 'currencies', displayName: 'EUR/CHF' },
  { internalName: 'GBP_JPY', expectedEpic: 'GBPJPY', searchTerm: 'GBPJPY', category: 'currencies', displayName: 'GBP/JPY' },
  { internalName: 'GBP_AUD', expectedEpic: 'GBPAUD', searchTerm: 'GBPAUD', category: 'currencies', displayName: 'GBP/AUD' },
  { internalName: 'AUD_JPY', expectedEpic: 'AUDJPY', searchTerm: 'AUDJPY', category: 'currencies', displayName: 'AUD/JPY' },
  { internalName: 'CAD_JPY', expectedEpic: 'CADJPY', searchTerm: 'CADJPY', category: 'currencies', displayName: 'CAD/JPY' },

  // --- Indices (10) ---
  { internalName: 'US30_USD',   expectedEpic: 'US30',  searchTerm: 'Dow Jones',     category: 'equities', displayName: 'Dow Jones' },
  { internalName: 'US500_USD',  expectedEpic: 'US500', searchTerm: 'S&P 500',       category: 'equities', displayName: 'S&P 500' },
  { internalName: 'GER40_EUR',  expectedEpic: 'DE40',  searchTerm: 'DAX',           category: 'equities', displayName: 'DAX' },
  { internalName: 'NAS100_USD', expectedEpic: 'USTEC', searchTerm: 'Nasdaq 100',    category: 'equities', displayName: 'NASDAQ 100' },
  { internalName: 'UK100_GBP',  expectedEpic: 'UK100', searchTerm: 'FTSE 100',      category: 'equities', displayName: 'FTSE 100' },
  { internalName: 'JP225_USD',  expectedEpic: 'JP225', searchTerm: 'Nikkei 225',    category: 'equities', displayName: 'Nikkei 225' },
  { internalName: 'FR40_EUR',   expectedEpic: 'FR40',  searchTerm: 'CAC 40',        category: 'equities', displayName: 'CAC 40' },
  { internalName: 'AU200_AUD',  expectedEpic: 'AU200', searchTerm: 'ASX 200',       category: 'equities', displayName: 'ASX 200' },
  { internalName: 'HK50_HKD',   expectedEpic: 'HK50',  searchTerm: 'Hang Seng',     category: 'equities', displayName: 'Hang Seng' },
  { internalName: 'EU50_EUR',   expectedEpic: 'EU50',  searchTerm: 'Euro Stoxx 50', category: 'equities', displayName: 'STOXX 50' },

  // --- Commodities (10) ---
  { internalName: 'XAU_USD',    expectedEpic: 'GOLD',          searchTerm: 'Gold',        category: 'commodities', displayName: 'Gold' },
  { internalName: 'XAG_USD',    expectedEpic: 'SILVER',        searchTerm: 'Silver',      category: 'commodities', displayName: 'Silver' },
  { internalName: 'BCO_USD',    expectedEpic: 'OIL_CRUDE',     searchTerm: 'Brent Oil',   category: 'commodities', displayName: 'Brent Oil' },
  { internalName: 'WTICO_USD',  expectedEpic: 'OIL_CRUDE_WTI', searchTerm: 'WTI Crude',   category: 'commodities', displayName: 'WTI Oil' },
  { internalName: 'NATGAS_USD', expectedEpic: 'NATURALGAS',    searchTerm: 'Natural Gas', category: 'commodities', displayName: 'Natural Gas' },
  { internalName: 'HG_USD',     expectedEpic: 'COPPER',        searchTerm: 'Copper',      category: 'commodities', displayName: 'Copper' },
  { internalName: 'XPT_USD',    expectedEpic: 'PLATINUM',      searchTerm: 'Platinum',    category: 'commodities', displayName: 'Platinum' },
  { internalName: 'XPD_USD',    expectedEpic: 'PALLADIUM',     searchTerm: 'Palladium',   category: 'commodities', displayName: 'Palladium' },
  { internalName: 'COFFEE_USD', expectedEpic: 'COFFEE',        searchTerm: 'Coffee',      category: 'commodities', displayName: 'Coffee' },
  { internalName: 'COTTON_USD', expectedEpic: 'COTTON',        searchTerm: 'Cotton',      category: 'commodities', displayName: 'Cotton' },

  // --- Crypto (10) ---
  { internalName: 'BTC_USD',  expectedEpic: 'BTCUSD',  searchTerm: 'Bitcoin',    category: 'crypto', displayName: 'Bitcoin' },
  { internalName: 'ETH_USD',  expectedEpic: 'ETHUSD',  searchTerm: 'Ethereum',   category: 'crypto', displayName: 'Ethereum' },
  { internalName: 'SOL_USD',  expectedEpic: 'SOLUSD',  searchTerm: 'Solana',     category: 'crypto', displayName: 'Solana' },
  { internalName: 'XRP_USD',  expectedEpic: 'XRPUSD',  searchTerm: 'XRP',        category: 'crypto', displayName: 'XRP' },
  { internalName: 'LTC_USD',  expectedEpic: 'LTCUSD',  searchTerm: 'Litecoin',   category: 'crypto', displayName: 'Litecoin' },
  { internalName: 'ADA_USD',  expectedEpic: 'ADAUSD',  searchTerm: 'Cardano',    category: 'crypto', displayName: 'Cardano' },
  { internalName: 'DOGE_USD', expectedEpic: 'DOGEUSD', searchTerm: 'Dogecoin',   category: 'crypto', displayName: 'Dogecoin' },
  { internalName: 'AVAX_USD', expectedEpic: 'AVAXUSD', searchTerm: 'Avalanche',  category: 'crypto', displayName: 'Avalanche' },
  { internalName: 'DOT_USD',  expectedEpic: 'DOTUSD',  searchTerm: 'Polkadot',   category: 'crypto', displayName: 'Polkadot' },
  { internalName: 'LINK_USD', expectedEpic: 'LINKUSD', searchTerm: 'Chainlink',  category: 'crypto', displayName: 'Chainlink' },

  // --- Bonds (5) — futures, not yields ---
  { internalName: 'USB_USD',  expectedEpic: 'USTBOND', searchTerm: 'US Treasury Bond',     category: 'bonds', displayName: 'US T-Bond' },
  { internalName: 'BUND_EUR', expectedEpic: 'BUND',    searchTerm: 'German Bund',          category: 'bonds', displayName: 'German Bund' },
  { internalName: 'GILT_GBP', expectedEpic: 'GILT',    searchTerm: 'UK Long Gilt',         category: 'bonds', displayName: 'UK Gilt' },
  { internalName: 'JGB_JPY',  expectedEpic: 'JGB',     searchTerm: 'Japan Government Bond', category: 'bonds', displayName: 'Japan Gov Bond' },
  { internalName: 'USTN_USD', expectedEpic: 'USTNOTE', searchTerm: 'US 10 Year Note',      category: 'bonds', displayName: 'US T-Note' },
]

interface MarketSummary {
  epic: string
  name: string
  type: string
  status: string
  expiry?: string
}

async function verifyEpic(session: CapitalSession, epic: string): Promise<MarketSummary | null> {
  const res = await fetch(`${CAPITAL_BASE_URL}/api/v1/markets/${encodeURIComponent(epic)}`, {
    headers: {
      'X-SECURITY-TOKEN': session.securityToken,
      'CST': session.cst,
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  const data = await res.json() as {
    instrument?: { epic?: string; name?: string; type?: string; expiry?: string }
    snapshot?: { marketStatus?: string }
  }
  return {
    epic: data.instrument?.epic ?? epic,
    name: data.instrument?.name ?? '',
    type: data.instrument?.type ?? '',
    status: data.snapshot?.marketStatus ?? '',
    expiry: data.instrument?.expiry,
  }
}

async function searchMarkets(session: CapitalSession, term: string): Promise<MarketSummary[]> {
  const res = await fetch(`${CAPITAL_BASE_URL}/api/v1/markets?searchTerm=${encodeURIComponent(term)}`, {
    headers: {
      'X-SECURITY-TOKEN': session.securityToken,
      'CST': session.cst,
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return []
  const data = await res.json() as { markets?: Array<{ epic: string; instrumentName: string; instrumentType: string; marketStatus: string; expiry?: string }> }
  return (data.markets ?? []).slice(0, 8).map(m => ({
    epic: m.epic,
    name: m.instrumentName,
    type: m.instrumentType,
    status: m.marketStatus,
    expiry: m.expiry,
  }))
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const session = await createSession()

    const results: Array<{
      internalName: string
      category: string
      displayName: string
      expectedEpic: string
      searchTerm: string
      directHit: MarketSummary | null
      searchResults: MarketSummary[]
    }> = []

    for (const c of CANDIDATES) {
      const direct = await verifyEpic(session, c.expectedEpic).catch(() => null)
      const searchResults = await searchMarkets(session, c.searchTerm).catch(() => [])

      results.push({
        internalName: c.internalName,
        category: c.category,
        displayName: c.displayName,
        expectedEpic: c.expectedEpic,
        searchTerm: c.searchTerm,
        directHit: direct,
        searchResults,
      })

      // Be polite — Capital.com limit is 10 req/sec
      await new Promise(r => setTimeout(r, 150))
    }

    // Summary counts
    const directHitCount = results.filter(r => r.directHit).length
    const missing = results.filter(r => !r.directHit).map(r => r.internalName)

    return NextResponse.json({
      ok: true,
      total: results.length,
      directHits: directHitCount,
      missing,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
