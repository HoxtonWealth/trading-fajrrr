/**
 * Capital.com client for Render monitor — simplified version.
 * Session auth with auto-renewal.
 */

const BASE_URL = process.env.CAPITAL_BASE_URL || 'https://demo-api-capital.backend-capital.com'
const API_KEY = process.env.CAPITAL_API_KEY!
const IDENTIFIER = process.env.CAPITAL_IDENTIFIER!
const PASSWORD = process.env.CAPITAL_PASSWORD!

let cst: string | null = null
let securityToken: string | null = null
let authTime = 0
const SESSION_TTL = 9 * 60 * 1000

const EPIC_MAP: Record<string, string> = {
  EUR_USD: 'EURUSD', USD_JPY: 'USDJPY', XAU_USD: 'GOLD',
  BCO_USD: 'OIL_CRUDE', EUR_GBP: 'EURGBP', US30_USD: 'US30',
}
const REVERSE_EPIC: Record<string, string> = {}
for (const [k, v] of Object.entries(EPIC_MAP)) REVERSE_EPIC[v] = k

function fromEpic(epic: string) { return REVERSE_EPIC[epic] ?? epic }

async function ensureSession() {
  if (cst && securityToken && Date.now() - authTime < SESSION_TTL) return
  const res = await fetch(`${BASE_URL}/api/v1/session`, {
    method: 'POST',
    headers: { 'X-CAP-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Capital.com auth failed ${res.status}`)
  cst = res.headers.get('CST')
  securityToken = res.headers.get('X-SECURITY-TOKEN')
  if (!cst || !securityToken) throw new Error('Missing auth headers')
  authTime = Date.now()
}

function authHeaders() {
  return { 'X-SECURITY-TOKEN': securityToken!, 'CST': cst!, 'Content-Type': 'application/json' }
}

export async function getOpenTrades() {
  await ensureSession()
  const res = await fetch(`${BASE_URL}/api/v1/positions`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Capital.com error ${res.status}`)
  const data = await res.json() as { positions: any[] }
  return (data.positions ?? []).map((p: any) => ({
    id: p.position.dealId,
    instrument: fromEpic(p.market.epic),
    currentUnits: (p.position.direction === 'BUY' ? p.position.size : -p.position.size).toString(),
    price: p.position.level.toString(),
    unrealizedPL: p.position.upl.toString(),
    stopLossOrder: p.position.stopLevel ? { price: p.position.stopLevel.toString() } : undefined,
  }))
}

export async function getAccountSummary() {
  await ensureSession()
  const res = await fetch(`${BASE_URL}/api/v1/accounts`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Capital.com error ${res.status}`)
  const data = await res.json() as { accounts: any[] }
  const a = data.accounts[0]
  return {
    NAV: (a.balance.balance + a.balance.profitLoss).toString(),
    balance: a.balance.balance.toString(),
    unrealizedPL: a.balance.profitLoss.toString(),
    openTradeCount: 0, // filled by caller
  }
}

export async function placeMarketOrder(instrument: string, units: number, stopLoss: number) {
  await ensureSession()
  const epic = EPIC_MAP[instrument] ?? instrument
  const res = await fetch(`${BASE_URL}/api/v1/positions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      epic,
      direction: units > 0 ? 'BUY' : 'SELL',
      size: Math.abs(units),
      guaranteedStop: false,
      stopLevel: stopLoss,
    }),
  })
  if (!res.ok) throw new Error(`Capital.com order error ${res.status}: ${await res.text()}`)
  const result = await res.json() as { dealReference: string }

  await new Promise(r => setTimeout(r, 500))
  const confirmRes = await fetch(`${BASE_URL}/api/v1/confirms/${result.dealReference}`, { headers: authHeaders() })
  if (!confirmRes.ok) throw new Error(`Capital.com confirm error ${confirmRes.status}`)
  return confirmRes.json()
}

export async function closeTrade(tradeId: string) {
  await ensureSession()
  const res = await fetch(`${BASE_URL}/api/v1/positions/${tradeId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Capital.com close error ${res.status}`)
  return res.json()
}

export async function modifyStopLoss(tradeId: string, price: number) {
  await ensureSession()
  const res = await fetch(`${BASE_URL}/api/v1/positions/${tradeId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ stopLevel: price }),
  })
  if (!res.ok) throw new Error(`Capital.com modify error ${res.status}`)
}
