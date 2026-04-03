'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

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

function pctColor(v: number | null) {
  if (v == null) return 'text-text-muted'
  return v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-text-muted'
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
      <div className="p-7">
        <div className="skeleton h-6 w-40 mb-6" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>
        <div className="skeleton h-96 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)]">
      {/* Main column */}
      <div className="flex-1 p-7">
        <h1 className="font-serif text-[18px] font-semibold text-text-primary mb-5">Markets</h1>

        {/* Ticker cards — top 4 movers */}
        {topMovers.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {topMovers.map((a) => (
              <div key={a.id} className="bg-bg-warm border border-border-light rounded-lg px-3.5 py-3">
                <div className="font-sans text-[11px] font-medium text-text-muted uppercase">{a.symbol}</div>
                <div className="font-serif text-[18px] font-semibold text-text-primary mt-1">
                  {a.price != null ? formatPrice(a.price, a.category) : '—'}
                </div>
                <div className={`font-sans text-[12px] font-medium mt-0.5 ${pctColor(a.change_24h_pct)}`}>
                  {fmtPct(a.change_24h_pct)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Asset grid */}
        {grouped.length === 0 ? (
          <p className="font-serif italic text-text-muted text-center py-8">No price data yet.</p>
        ) : (
          grouped.map(group => (
            <section key={group.category} className="mb-6">
              <div className="section-label mb-2">{group.label}</div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-sans text-[11px] font-medium text-text-muted py-2 px-3">Instrument</th>
                    <th className="text-right font-sans text-[11px] font-medium text-text-muted py-2 px-3">Price</th>
                    <th className="text-right font-sans text-[11px] font-medium text-text-muted py-2 px-3">24h</th>
                    <th className="text-right font-sans text-[11px] font-medium text-text-muted py-2 px-3">1W</th>
                    <th className="text-right font-sans text-[11px] font-medium text-text-muted py-2 px-3">1Q</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(asset => (
                    <tr key={asset.id} className="border-b border-border-light hover:bg-bg-warm/50">
                      <td className="py-2 px-3 font-serif font-semibold text-[14px]">{asset.name}</td>
                      <td className="py-2 px-3 font-sans text-right">
                        {asset.price != null ? formatPrice(asset.price, asset.category) : '—'}
                      </td>
                      <td className={`py-2 px-3 font-sans text-right ${pctColor(asset.change_24h_pct)}`}>
                        {fmtPct(asset.change_24h_pct)}
                      </td>
                      <td className={`py-2 px-3 font-sans text-right ${pctColor(asset.change_1w_pct)}`}>
                        {fmtPct(asset.change_1w_pct)}
                      </td>
                      <td className={`py-2 px-3 font-sans text-right ${pctColor(asset.change_1q_pct)}`}>
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
      <aside className="w-[320px] bg-bg-warm border-l border-border-light p-5 flex flex-col gap-6">
        {/* Morning Briefing */}
        <section>
          <h3 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Morning Briefing</h3>
          {analysis ? (
            <div className="flex flex-col gap-4">
              <div className="font-sans text-[11px] text-text-muted">{analysis.analysis_date}</div>

              <div>
                <div className="section-label mb-1">Summary</div>
                <p className="font-serif text-[13px] text-text-mid leading-relaxed">{analysis.market_summary}</p>
              </div>

              {analysis.key_movers && analysis.key_movers.length > 0 && (
                <div>
                  <div className="section-label mb-1">Key Movers</div>
                  <div className="flex flex-col gap-1.5">
                    {analysis.key_movers.map((m, i) => (
                      <div key={i} className="font-serif text-[13px] text-text-mid leading-relaxed">
                        <span className="font-semibold text-text-primary">{m.instrument}</span>{' '}
                        <span className={m.change.startsWith('+') ? 'text-green' : m.change.startsWith('-') ? 'text-red' : ''}>
                          ({m.change})
                        </span>{' '}
                        — {m.explanation}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="section-label mb-1">Geopolitical Watch</div>
                <p className="font-serif text-[13px] text-text-mid leading-relaxed">{analysis.geopolitical_watch}</p>
              </div>

              <div>
                <div className="section-label mb-1">Week Ahead</div>
                <p className="font-serif text-[13px] text-text-mid leading-relaxed">{analysis.week_ahead}</p>
              </div>
            </div>
          ) : (
            <p className="font-serif italic text-[13px] text-text-muted text-center py-4">No analysis yet</p>
          )}
        </section>

        {/* Economic Calendar */}
        <section>
          <h3 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Economic Calendar</h3>
          {events.length === 0 ? (
            <p className="font-serif italic text-[13px] text-text-muted text-center py-4">No upcoming events</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {events.map((e, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border-light">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    e.impact === 'high' ? 'bg-red' : e.impact === 'medium' ? 'bg-amber' : 'bg-green'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-sans text-[12px] font-medium text-text-primary">{e.event_name}</div>
                    <div className="font-sans text-[11px] text-text-muted">
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
