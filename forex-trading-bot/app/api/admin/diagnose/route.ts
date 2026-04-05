/**
 * Diagnostic endpoint — tests Capital.com epic mappings and GDELT queries.
 * Temporary: remove after fixing issues.
 */
import { NextResponse } from 'next/server'

const CAPITAL_BASE_URL = (process.env.CAPITAL_BASE_URL || 'https://demo-api-capital.backend-capital.com').replace(/\/+$/, '')
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY
const CAPITAL_IDENTIFIER = process.env.CAPITAL_IDENTIFIER
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD

const GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // --- Test Capital.com epics ---
  try {
    const authRes = await fetch(`${CAPITAL_BASE_URL}/api/v1/session`, {
      method: 'POST',
      headers: { 'X-CAP-API-KEY': CAPITAL_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: CAPITAL_IDENTIFIER, password: CAPITAL_PASSWORD }),
    })
    const cst = authRes.headers.get('CST')
    const token = authRes.headers.get('X-SECURITY-TOKEN')

    const epicsToTest: Record<string, string[]> = {
      GER40_EUR: ['GERMANY40', 'DE40', 'GER40', 'GERMANY30'],
      XAG_USD: ['SILVER', 'XAGUSD'],
      US500_USD: ['US500', 'USTEC', 'US500USD', 'SPX500'],
      AUD_USD: ['AUDUSD'],
      GBP_USD: ['GBPUSD'],
      NZD_USD: ['NZDUSD'],
    }

    const epicResults: Record<string, unknown> = {}
    for (const [instrument, candidates] of Object.entries(epicsToTest)) {
      const tested: Record<string, string> = {}
      for (const epic of candidates) {
        try {
          const res = await fetch(`${CAPITAL_BASE_URL}/api/v1/prices/${epic}?resolution=HOUR_4&max=1`, {
            headers: { CST: cst!, 'X-SECURITY-TOKEN': token! },
          })
          tested[epic] = res.ok ? `OK (${res.status})` : `FAIL (${res.status})`
        } catch (e) {
          tested[epic] = `ERROR: ${e instanceof Error ? e.message : 'unknown'}`
        }
      }
      epicResults[instrument] = tested
    }
    results.capitalEpics = epicResults
  } catch (authErr) {
    results.capitalEpics = { error: `Auth failed: ${authErr instanceof Error ? authErr.message : 'unknown'}` }
  }

  // --- Test GDELT queries ---
  const gdeltQueries = [
    'sanctions OR "trade war" OR tariff',
    'sanctions tariff trade war',
    'military OR conflict OR war OR invasion',
  ]
  const gdeltResults: Record<string, unknown> = {}
  for (const query of gdeltQueries) {
    try {
      const params = new URLSearchParams({
        query, mode: 'ArtList', maxrecords: '3', format: 'json', timespan: '24h', sort: 'DateDesc',
      })
      const res = await fetch(`${GDELT_BASE_URL}?${params}`, { signal: AbortSignal.timeout(10000) })
      const text = await res.text()
      gdeltResults[query] = {
        status: res.status,
        ok: res.ok,
        bodyPreview: text.slice(0, 200),
      }
    } catch (e) {
      gdeltResults[query] = { error: e instanceof Error ? e.message : 'unknown' }
    }
  }
  results.gdelt = gdeltResults

  return NextResponse.json(results)
}
