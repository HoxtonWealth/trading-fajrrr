import { getSupabase } from '@/lib/services/supabase'
import type { MarketAssetRow, MarketPriceRow, MarketAnalysisRow, NewsCacheRow } from '@/lib/types/database'
import { RefreshButton } from './refresh-button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface AssetWithPrice extends MarketAssetRow {
  price: number | null
  change_24h_pct: number | null
  change_1w_pct: number | null
  change_1q_pct: number | null
}

interface EconomicEvent {
  event_name: string
  country: string
  impact: string
  event_time: string
}

const CATEGORY_ORDER = ['equities', 'currencies', 'commodities', 'bonds', 'crypto', 'volatility'] as const
const CATEGORY_LABELS: Record<string, string> = {
  equities: 'Equities',
  currencies: 'Currencies',
  commodities: 'Commodities',
  bonds: 'Bonds',
  crypto: 'Crypto',
  volatility: 'Volatility',
}

async function getData() {
  const supabase = getSupabase()

  const [assetsRes, pricesRes, analysisRes, newsRes, eventsRes] = await Promise.all([
    supabase.from('market_assets').select('*').eq('enabled', true).order('category'),
    supabase.from('market_prices').select('*').order('recorded_at', { ascending: false }),
    supabase.from('market_analyses').select('*').order('analysis_date', { ascending: false }).limit(1).single(),
    supabase.from('news_cache').select('*').eq('category', 'geopolitical').order('fetched_at', { ascending: false }).limit(10),
    supabase.from('economic_events').select('*').gte('event_time', new Date().toISOString()).order('event_time').limit(15),
  ])

  const allAssets = (assetsRes.data ?? []) as MarketAssetRow[]
  const allPrices = (pricesRes.data ?? []) as MarketPriceRow[]

  // Match latest price to each asset
  const priceMap = new Map<string, MarketPriceRow>()
  for (const p of allPrices) {
    if (!priceMap.has(p.asset_id)) {
      priceMap.set(p.asset_id, p)
    }
  }

  const assets: AssetWithPrice[] = allAssets.map(a => {
    const p = priceMap.get(a.id)
    return {
      ...a,
      price: p ? Number(p.price) : null,
      change_24h_pct: p?.change_24h_pct != null ? Number(p.change_24h_pct) : null,
      change_1w_pct: p?.change_1w_pct != null ? Number(p.change_1w_pct) : null,
      change_1q_pct: p?.change_1q_pct != null ? Number(p.change_1q_pct) : null,
    }
  })

  return {
    assets,
    analysis: analysisRes.data as MarketAnalysisRow | null,
    geoNews: (newsRes.data ?? []) as NewsCacheRow[],
    events: (eventsRes.data ?? []) as EconomicEvent[],
  }
}

export default async function MarketsPage() {
  const { assets, analysis, geoNews, events } = await getData()

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: assets.filter(a => a.category === cat),
  })).filter(g => g.items.length > 0)

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Global Markets</h1>
          <p style={{ color: '#666', margin: '4px 0 0 0' }}>
            Daily snapshot — 28 instruments across 6 asset classes
            {' · '}
            <a href="/dashboard" style={{ color: '#4a9' }}>← Dashboard</a>
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Asset Grid */}
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Asset Grid</h2>
        {grouped.length === 0 ? (
          <p style={empty}>No price data yet. Click Refresh Data to populate.</p>
        ) : (
          grouped.map(group => (
            <div key={group.category} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#888', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                {group.label}
              </h3>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    {['Instrument', 'Price', '24h', '1W', '1Q'].map(h => (
                      <th key={h} style={{ ...td, fontWeight: 'bold', background: '#f0f0f0', textAlign: h === 'Instrument' ? 'left' : 'right' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(asset => (
                    <tr key={asset.id}>
                      <td style={td}>{asset.name}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {asset.price !== null ? formatPrice(asset.price, asset.category) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: pctColor(asset.change_24h_pct) }}>
                        {fmtPct(asset.change_24h_pct)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: pctColor(asset.change_1w_pct) }}>
                        {fmtPct(asset.change_1w_pct)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: pctColor(asset.change_1q_pct) }}>
                        {fmtPct(asset.change_1q_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      {/* AI Morning Briefing */}
      <section style={{ marginTop: '2rem' }}>
        <h2>Morning Briefing</h2>
        {analysis ? (
          <div style={card}>
            <p style={{ color: '#999', fontSize: '0.8rem', marginTop: 0 }}>{analysis.analysis_date}</p>

            <h3 style={h3}>Summary</h3>
            <p style={bodyText}>{analysis.market_summary}</p>

            {analysis.key_movers && (analysis.key_movers as Array<{ instrument: string; change: string; explanation: string }>).length > 0 && (
              <>
                <h3 style={{ ...h3, marginTop: '1rem' }}>Key Movers</h3>
                <ul style={{ paddingLeft: '1.2rem', color: '#444', lineHeight: 1.6 }}>
                  {(analysis.key_movers as Array<{ instrument: string; change: string; explanation: string }>).map((m, i) => (
                    <li key={i}><strong>{m.instrument}</strong> ({m.change}) — {m.explanation}</li>
                  ))}
                </ul>
              </>
            )}

            <h3 style={{ ...h3, marginTop: '1rem' }}>Geopolitical Watch</h3>
            <p style={bodyText}>{analysis.geopolitical_watch}</p>

            <h3 style={{ ...h3, marginTop: '1rem' }}>Week Ahead</h3>
            <p style={bodyText}>{analysis.week_ahead}</p>
          </div>
        ) : (
          <p style={empty}>No AI analysis yet. Click Refresh Data to generate.</p>
        )}
      </section>

      {/* Geopolitical Headlines */}
      <section style={{ marginTop: '2rem' }}>
        <h2>Geopolitical Headlines</h2>
        {geoNews.length > 0 ? (
          <div style={card}>
            {geoNews.map((n, i) => (
              <div key={n.id} style={{ padding: '6px 0', borderBottom: i < geoNews.length - 1 ? '1px solid #eee' : 'none' }}>
                <a href={n.url ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#2a7', textDecoration: 'none' }}>
                  {n.title}
                </a>
                <span style={{ color: '#999', fontSize: '0.8rem', marginLeft: '8px' }}>
                  {n.source} · {timeAgo(n.published_at || n.fetched_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={empty}>No geopolitical headlines yet. The GDELT cron will populate this.</p>
        )}
      </section>

      {/* Economic Calendar */}
      <section style={{ marginTop: '2rem', marginBottom: '3rem' }}>
        <h2>Economic Calendar</h2>
        {events.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['Event', 'Country', 'Impact', 'Date/Time'].map(h => (
                  <th key={h} style={{ ...td, fontWeight: 'bold', background: '#f0f0f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td style={td}>{e.event_name}</td>
                  <td style={td}>{e.country}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      background: e.impact === 'high' ? '#ffe0e0' : '#fff3d0',
                      color: e.impact === 'high' ? '#c33' : '#a80',
                    }}>
                      {e.impact}
                    </span>
                  </td>
                  <td style={td}>{new Date(e.event_time).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={empty}>No upcoming economic events.</p>
        )}
      </section>
    </main>
  )
}

// --- Styles ---

const td: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '6px 10px',
  textAlign: 'left',
}

const card: React.CSSProperties = {
  padding: '14px 18px',
  background: '#f8f9fa',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
}

const h3: React.CSSProperties = { fontSize: '0.95rem', marginBottom: '6px' }
const bodyText: React.CSSProperties = { color: '#444', lineHeight: 1.5 }
const empty: React.CSSProperties = { color: '#999', fontStyle: 'italic' }

// --- Formatters ---

function pctColor(v: number | null): string {
  if (v === null) return '#999'
  return v > 0 ? '#2a7' : v < 0 ? '#c33' : '#666'
}

function fmtPct(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

function formatPrice(price: number, category: string): string {
  if (category === 'currencies') return price.toFixed(4)
  if (category === 'crypto') return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (category === 'bonds') return price.toFixed(3) + '%'
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
