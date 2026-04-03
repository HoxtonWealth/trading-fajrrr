'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

const FONT_SERIF = "Georgia, 'Times New Roman', serif"
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif"

interface MarketAsset {
  id: string
  name: string
  symbol: string
  category: string
  enabled: boolean
}

interface MarketPrice {
  asset_id: string
  price: number
  change_24h_pct: number | null
  change_1w_pct: number | null
  change_1q_pct: number | null
}

interface AssetWithPrice extends MarketAsset {
  price: number | null
  change_24h_pct: number | null
  change_1w_pct: number | null
  change_1q_pct: number | null
}

interface MarketAnalysis {
  analysis_date: string
  market_summary: string | null
  key_movers: Array<{ instrument: string; change: string; explanation: string }> | null
  geopolitical_watch: string | null
  week_ahead: string | null
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

function pctColorVar(v: number | null) {
  if (v == null) return 'var(--color-text-muted)'
  return v > 0 ? 'var(--color-green)' : v < 0 ? 'var(--color-red)' : 'var(--color-text-muted)'
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

function formatPrice(price: number, category: string) {
  if (category === 'currencies') return price.toFixed(4)
  if (category === 'crypto') return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (category === 'bonds') return price.toFixed(3) + '%'
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function MarketsPage() {
  const [assets, setAssets] = useState<AssetWithPrice[]>([])
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const [assetsRes, pricesRes, analysisRes, eventsRes] = await Promise.all([
        supabase.from('market_assets').select('*').eq('enabled', true).order('category'),
        supabase.from('market_prices').select('*').order('recorded_at', { ascending: false }),
        supabase.from('market_analyses').select('*').order('analysis_date', { ascending: false }).limit(1).single(),
        supabase.from('economic_events').select('*').gte('event_time', new Date().toISOString()).order('event_time').limit(15),
      ])

      const allAssets = (assetsRes.data ?? []) as MarketAsset[]
      const allPrices = (pricesRes.data ?? []) as MarketPrice[]

      const priceMap = new Map<string, MarketPrice>()
      for (const p of allPrices) {
        if (!priceMap.has(p.asset_id)) priceMap.set(p.asset_id, p)
      }

      setAssets(allAssets.map(a => {
        const p = priceMap.get(a.id)
        return {
          ...a,
          price: p ? Number(p.price) : null,
          change_24h_pct: p?.change_24h_pct != null ? Number(p.change_24h_pct) : null,
          change_1w_pct: p?.change_1w_pct != null ? Number(p.change_1w_pct) : null,
          change_1q_pct: p?.change_1q_pct != null ? Number(p.change_1q_pct) : null,
        }
      }))

      if (analysisRes.data) setAnalysis(analysisRes.data as MarketAnalysis)
      setEvents((eventsRes.data ?? []) as EconomicEvent[])
      setLoading(false)
    }
    fetchAll()

    // Realtime on market_prices
    const priceChannel = supabase
      .channel('markets-prices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_prices' }, () => {
        // Re-fetch prices on any change
        Promise.all([
          supabase.from('market_assets').select('*').eq('enabled', true).order('category'),
          supabase.from('market_prices').select('*').order('recorded_at', { ascending: false }),
        ]).then(([assetsRes, pricesRes]) => {
          const allAssets = (assetsRes.data ?? []) as MarketAsset[]
          const allPrices = (pricesRes.data ?? []) as MarketPrice[]
          const priceMap = new Map<string, MarketPrice>()
          for (const p of allPrices) {
            if (!priceMap.has(p.asset_id)) priceMap.set(p.asset_id, p)
          }
          setAssets(allAssets.map(a => {
            const p = priceMap.get(a.id)
            return {
              ...a,
              price: p ? Number(p.price) : null,
              change_24h_pct: p?.change_24h_pct != null ? Number(p.change_24h_pct) : null,
              change_1w_pct: p?.change_1w_pct != null ? Number(p.change_1w_pct) : null,
              change_1q_pct: p?.change_1q_pct != null ? Number(p.change_1q_pct) : null,
            }
          }))
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(priceChannel)
    }
  }, [])

  // Top 4 movers by absolute 24h change
  const topMovers = [...assets]
    .filter(a => a.change_24h_pct != null)
    .sort((a, b) => Math.abs(b.change_24h_pct!) - Math.abs(a.change_24h_pct!))
    .slice(0, 4)

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: assets.filter(a => a.category === cat),
  })).filter(g => g.items.length > 0)

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div className="skeleton" style={{ height: 24, width: 160, marginBottom: 24 }} />
        <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />)}
        </div>
        <div className="skeleton" style={{ height: 384, borderRadius: 10 }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)' }} className="flex">
      {/* Main column */}
      <div className="flex-1" style={{ padding: 28 }}>
        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 20,
          }}
        >
          Markets
        </h1>

        {/* Ticker cards — top 4 movers */}
        {topMovers.length > 0 && (
          <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
            {topMovers.map((a) => (
              <div
                key={a.id}
                style={{
                  backgroundColor: 'var(--color-bg-warm)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: 0.3,
                  }}
                >
                  {a.symbol}
                </div>
                <div
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginTop: 4,
                  }}
                >
                  {a.price != null ? formatPrice(a.price, a.category) : '—'}
                </div>
                <div
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    fontWeight: 500,
                    marginTop: 2,
                    color: pctColorVar(a.change_24h_pct),
                  }}
                >
                  {fmtPct(a.change_24h_pct)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Asset grid */}
        {grouped.length === 0 ? (
          <p
            style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              padding: '32px 0',
            }}
          >
            No price data yet.
          </p>
        ) : (
          grouped.map(group => (
            <section className="content-card" key={group.category} style={{ marginBottom: 24 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>{group.label}</div>
              <table className="editorial-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">24h</th>
                    <th className="text-right">1W</th>
                    <th className="text-right">1Q</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(asset => (
                    <tr key={asset.id}>
                      <td className="instrument-cell" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 14 }}>
                        {asset.name}
                      </td>
                      <td className="text-right" style={{ fontFamily: FONT_SANS }}>
                        {asset.price != null ? formatPrice(asset.price, asset.category) : '—'}
                      </td>
                      <td className="text-right" style={{ fontFamily: FONT_SANS, color: pctColorVar(asset.change_24h_pct) }}>
                        {fmtPct(asset.change_24h_pct)}
                      </td>
                      <td className="text-right" style={{ fontFamily: FONT_SANS, color: pctColorVar(asset.change_1w_pct) }}>
                        {fmtPct(asset.change_1w_pct)}
                      </td>
                      <td className="text-right" style={{ fontFamily: FONT_SANS, color: pctColorVar(asset.change_1q_pct) }}>
                        {fmtPct(asset.change_1q_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>

      {/* Right panel */}
      <aside
        style={{
          width: 320,
          backgroundColor: 'var(--color-bg-warm)',
          borderLeft: '0.5px solid var(--color-border-light)',
          padding: 20,
          overflowY: 'auto',
        }}
        className="flex flex-col shrink-0"
      >
        {/* Morning Briefing */}
        <section className="panel-card" style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 12,
            }}
          >
            Morning Briefing
          </h3>
          {analysis ? (
            <div className="flex flex-col" style={{ gap: 16 }}>
              <div style={{ fontFamily: FONT_SANS, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {analysis.analysis_date}
              </div>

              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Summary</div>
                <p style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 13,
                  color: 'var(--color-text-mid)',
                  lineHeight: 1.6,
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}>
                  {analysis.market_summary}
                </p>
              </div>

              {analysis.key_movers && analysis.key_movers.length > 0 && (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Key Movers</div>
                  <div className="flex flex-col" style={{ gap: 6 }}>
                    {analysis.key_movers.map((m, i) => (
                      <div key={i} style={{
                        fontFamily: FONT_SERIF,
                        fontSize: 13,
                        color: 'var(--color-text-mid)',
                        lineHeight: 1.6,
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                      }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{m.instrument}</span>{' '}
                        <span style={{
                          color: m.change.startsWith('+') ? 'var(--color-green)' : m.change.startsWith('-') ? 'var(--color-red)' : undefined
                        }}>
                          ({m.change})
                        </span>{' '}
                        — {m.explanation}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Geopolitical Watch</div>
                <p style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 13,
                  color: 'var(--color-text-mid)',
                  lineHeight: 1.6,
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}>
                  {analysis.geopolitical_watch}
                </p>
              </div>

              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Week Ahead</div>
                <p style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 13,
                  color: 'var(--color-text-mid)',
                  lineHeight: 1.6,
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}>
                  {analysis.week_ahead}
                </p>
              </div>
            </div>
          ) : (
            <p style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              padding: '16px 0',
            }}>
              No analysis yet
            </p>
          )}
        </section>

        {/* Economic Calendar */}
        <section className="panel-card">
          <h3
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 12,
            }}
          >
            Economic Calendar
          </h3>
          {events.length === 0 ? (
            <p style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              padding: '16px 0',
            }}>
              No upcoming events
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 0 }}>
              {events.map((e, i) => (
                <div
                  key={i}
                  className="flex items-start"
                  style={{
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '0.5px solid var(--color-border-light)',
                  }}
                >
                  <span
                    style={{
                      marginTop: 6,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: e.impact === 'high'
                        ? 'var(--color-red)'
                        : e.impact === 'medium'
                        ? 'var(--color-amber)'
                        : 'var(--color-green)',
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontFamily: FONT_SANS,
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {e.event_name}
                    </div>
                    <div style={{
                      fontFamily: FONT_SANS,
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                    }}>
                      {e.country} · {formatEventDate(e.event_time)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
