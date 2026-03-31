const BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com/v3'
const API_KEY = process.env.OANDA_API_KEY!
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID!

function headers() {
  return {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function getOpenTrades() {
  const res = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/openTrades`, { headers: headers() })
  if (!res.ok) throw new Error(`OANDA error ${res.status}`)
  const data = await res.json() as { trades: any[] }
  return data.trades
}

export async function getAccountSummary() {
  const res = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/summary`, { headers: headers() })
  if (!res.ok) throw new Error(`OANDA error ${res.status}`)
  const data = await res.json() as { account: any }
  return data.account
}

export async function placeMarketOrder(instrument: string, units: number, stopLoss: number) {
  const res = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/orders`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      order: {
        type: 'MARKET',
        instrument,
        units: String(units),
        timeInForce: 'FOK',
        stopLossOnFill: { price: stopLoss.toFixed(5), timeInForce: 'GTC' },
      },
    }),
  })
  if (!res.ok) throw new Error(`OANDA order error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function closeTrade(tradeId: string) {
  const res = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/trades/${tradeId}/close`, {
    method: 'PUT',
    headers: headers(),
  })
  if (!res.ok) throw new Error(`OANDA close error ${res.status}`)
  return res.json()
}

export async function modifyStopLoss(tradeId: string, price: number) {
  const res = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/trades/${tradeId}/orders`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ stopLoss: { price: price.toFixed(5), timeInForce: 'GTC' } }),
  })
  if (!res.ok) throw new Error(`OANDA modify error ${res.status}`)
}
