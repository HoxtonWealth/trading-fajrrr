'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { KillSwitchButton } from './KillSwitchButton'
import { CircuitBreakerReset } from './CircuitBreakerReset'

const FONT_SERIF = "Georgia, 'Times New Roman', serif"
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif"

interface Equity {
  equity: number
  balance: number
  daily_pnl: number
  drawdown_percent: number
  unrealized_pnl: number
  open_positions: number
}

interface Trade {
  id: string
  instrument: string
  direction: string
  strategy: string
  status: string
  entry_price: number
  pnl: number | null
  opened_at: string
  closed_at: string | null
}

interface Scorecard {
  id: string
  agent: string
  instrument: string
  total_trades: number
  win_rate: number
  avg_pnl: number
  weight: number
}

interface Signal {
  id: string
  signal_type: string
  description: string
  strength: number
  direction: string
}

interface CronLog {
  id: string
  cron_name: string
  success: boolean
  summary: string
  created_at: string
}

interface SystemState {
  key: string
  value: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatStateValue(key: string, value: string): string {
  // Truncate ISO timestamps or long values for display
  if (key.includes('_at') || key.includes('date')) {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
          ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }
    } catch { /* use raw value */ }
  }
  return value
}

export default function Dashboard() {
  const [equity, setEquity] = useState<Equity | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [cronLogs, setCronLogs] = useState<CronLog[]>([])
  const [systemState, setSystemState] = useState<SystemState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const [eqRes, trRes, scRes, sigRes, logRes, stRes] = await Promise.all([
        supabase.from('equity_snapshots').select('*').order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('trades').select('*').order('opened_at', { ascending: false }).limit(10),
        supabase.from('agent_scorecards').select('*').order('win_rate', { ascending: false }),
        supabase.from('prediction_signals').select('*').eq('status', 'active').order('strength', { ascending: false }).limit(5),
        supabase.from('cron_logs').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('system_state').select('*'),
      ])
      if (eqRes.data) setEquity(eqRes.data)
      setTrades(trRes.data ?? [])
      setScorecards(scRes.data ?? [])
      setSignals(sigRes.data ?? [])
      setCronLogs(logRes.data ?? [])
      setSystemState(stRes.data ?? [])
      setLoading(false)
    }
    fetchAll()

    // Realtime
    const tradesChannel = supabase
      .channel('dashboard-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        supabase.from('trades').select('*').order('opened_at', { ascending: false }).limit(10)
          .then(({ data }) => { if (data) setTrades(data) })
      })
      .subscribe()

    const equityChannel = supabase
      .channel('dashboard-equity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'equity_snapshots' }, (payload) => {
        setEquity(payload.new as Equity)
      })
      .subscribe()

    const cronChannel = supabase
      .channel('dashboard-cron')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cron_logs' }, () => {
        supabase.from('cron_logs').select('*').order('created_at', { ascending: false }).limit(10)
          .then(({ data }) => { if (data) setCronLogs(data) })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(tradesChannel)
      supabase.removeChannel(equityChannel)
      supabase.removeChannel(cronChannel)
    }
  }, [])

  const fmtCurrency = (v: number | null | undefined) =>
    v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—'

  const pnlColorVar = (v: number | null | undefined) =>
    v == null ? 'var(--color-text-muted)' : Number(v) > 0 ? 'var(--color-green)' : Number(v) < 0 ? 'var(--color-red)' : 'var(--color-text-muted)'

  const killSwitchValue = systemState.find((s) => s.key === 'kill_switch')?.value ?? 'inactive'

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div className="skeleton" style={{ height: 24, width: 160, marginBottom: 24 }} />
        <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />)}
        </div>
        <div className="skeleton" style={{ height: 256, borderRadius: 10 }} />
      </div>
    )
  }

  const openTrades = trades.filter((t) => t.status === 'open')
  const closedTrades = trades.filter((t) => t.status !== 'open')

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)' }} className="flex">
      {/* Main column */}
      <div className="flex-1" style={{ padding: 28 }}>
        {/* Page title */}
        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 20,
          }}
        >
          Dashboard
        </h1>

        {/* Ticker cards */}
        <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
          <TickerCard label="Equity" value={fmtCurrency(equity?.equity)} />
          <TickerCard label="Balance" value={fmtCurrency(equity?.balance)} />
          <TickerCard
            label="Daily P&L"
            value={fmtPct(equity?.daily_pnl)}
            valueColor={pnlColorVar(equity?.daily_pnl)}
          />
          <TickerCard
            label="Drawdown"
            value={fmtPct(equity?.drawdown_percent ? -Math.abs(equity.drawdown_percent) : null)}
            valueColor={
              equity?.drawdown_percent != null && equity.drawdown_percent > 10
                ? 'var(--color-red)'
                : 'var(--color-text-muted)'
            }
          />
        </div>

        {/* Safety controls */}
        <div style={{ marginBottom: 32 }}>
          <CircuitBreakerReset currentDrawdown={equity ? Number(equity.drawdown_percent) : 0} />
        </div>

        {/* Recent Trades */}
        <section className="content-card" style={{ marginBottom: 28 }}>
          <h2
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 16,
            }}
          >
            Recent Trades
          </h2>

          {trades.length === 0 ? (
            <p
              style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                padding: '32px 0',
              }}
            >
              No trades yet
            </p>
          ) : (
            <>
              {openTrades.length > 0 && (
                <>
                  <div className="section-label" style={{ marginBottom: 8 }}>Open</div>
                  <TradesTable trades={openTrades} fmtCurrency={fmtCurrency} pnlColorVar={pnlColorVar} />
                </>
              )}
              {closedTrades.length > 0 && (
                <>
                  <div className="section-label" style={{ marginBottom: 8, marginTop: openTrades.length > 0 ? 20 : 0 }}>Closed</div>
                  <TradesTable trades={closedTrades} fmtCurrency={fmtCurrency} pnlColorVar={pnlColorVar} />
                </>
              )}
            </>
          )}
        </section>

        {/* Recent Activity */}
        <section className="content-card" style={{ marginBottom: 28 }}>
          <h2
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 16,
            }}
          >
            Recent Activity
          </h2>
          {cronLogs.length === 0 ? (
            <p
              style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                padding: '32px 0',
              }}
            >
              No activity yet
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 0 }}>
              {cronLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start"
                  style={{
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '0.5px solid var(--color-border-light)',
                  }}
                >
                  <span
                    style={{
                      marginTop: 5,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: log.success ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="flex items-center justify-between">
                      <span
                        style={{
                          fontFamily: FONT_SANS,
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {log.cron_name}
                      </span>
                      <span
                        style={{
                          fontFamily: FONT_SANS,
                          fontSize: 11,
                          color: 'var(--color-text-muted)',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: FONT_SANS,
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {log.summary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agent Scorecards */}
        <section className="content-card">
          <h2
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 16,
            }}
          >
            Agent Scorecards
          </h2>
          {scorecards.length === 0 ? (
            <p
              style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                padding: '32px 0',
              }}
            >
              No scorecard data yet
            </p>
          ) : (
            <table className="editorial-table">
              <thead>
                <tr>
                  {['Agent', 'Instrument', 'Trades', 'Win Rate', 'Avg P&L', 'Weight'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecards.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: FONT_SANS }}>{s.agent}</td>
                    <td className="instrument-cell" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 14 }}>{s.instrument}</td>
                    <td style={{ fontFamily: FONT_SANS }}>{s.total_trades}</td>
                    <td style={{ fontFamily: FONT_SANS }}>{(Number(s.win_rate) * 100).toFixed(1)}%</td>
                    <td style={{ fontFamily: FONT_SANS, color: pnlColorVar(s.avg_pnl) }}>
                      {fmtCurrency(s.avg_pnl)}
                    </td>
                    <td style={{ fontFamily: FONT_SANS }}>{Number(s.weight).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
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
        {/* Bot Status */}
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
            Bot Status
          </h3>
          <div className="flex flex-col" style={{ gap: 0 }}>
            {systemState.map((s) => (
              <div
                key={s.key}
                className="flex justify-between items-center"
                style={{
                  padding: '8px 0',
                  borderBottom: '0.5px solid var(--color-border-light)',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {s.key}
                </span>
                <span
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    fontWeight: 500,
                    color: s.key === 'kill_switch' && s.value === 'active' ? 'var(--color-red)' : 'var(--color-text-primary)',
                    textAlign: 'right',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    maxWidth: 160,
                  }}
                  title={s.value}
                >
                  {formatStateValue(s.key, s.value)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <KillSwitchButton initialState={killSwitchValue} />
          </div>
        </section>

        {/* Active Signals */}
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
            Active Signals
          </h3>
          {signals.length === 0 ? (
            <p
              style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                padding: '16px 0',
              }}
            >
              No active signals
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {signals.map((s) => (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: 'var(--color-bg-warm)',
                    border: '0.5px solid var(--color-border-light)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: FONT_SANS,
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase' as const,
                      }}
                    >
                      {s.signal_type}
                    </span>
                    <span className={s.direction === 'bullish' ? 'tag-long' : s.direction === 'bearish' ? 'tag-short' : ''}
                      style={s.direction !== 'bullish' && s.direction !== 'bearish' ? {
                        fontFamily: FONT_SANS, fontSize: 10, color: 'var(--color-text-muted)'
                      } : undefined}
                    >
                      {s.direction}
                    </span>
                  </div>
                  <p style={{ fontFamily: FONT_SANS, fontSize: 12, color: 'var(--color-text-mid)', lineHeight: 1.5 }}>{s.description}</p>
                  <div style={{ marginTop: 4, fontFamily: FONT_SANS, fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Strength: {Number(s.strength).toFixed(2)}
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

/* --- Sub-components --- */

function TickerCard({
  label,
  value,
  valueColor = 'var(--color-text-primary)',
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div
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
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 18,
          fontWeight: 600,
          color: valueColor,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function TradesTable({
  trades,
  fmtCurrency,
  pnlColorVar,
}: {
  trades: Trade[]
  fmtCurrency: (v: number | null | undefined) => string
  pnlColorVar: (v: number | null | undefined) => string
}) {
  return (
    <table className="editorial-table">
      <thead>
        <tr>
          {['Instrument', 'Direction', 'Strategy', 'Entry', 'P&L', 'Time'].map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id}>
            <td className="instrument-cell" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 14 }}>
              {t.instrument}
            </td>
            <td>
              <span className={t.direction === 'long' ? 'tag-long' : 'tag-short'}>{t.direction}</span>
            </td>
            <td style={{ fontFamily: FONT_SANS }}>{t.strategy}</td>
            <td style={{ fontFamily: FONT_SANS }}>{Number(t.entry_price).toFixed(4)}</td>
            <td style={{ fontFamily: FONT_SANS, color: pnlColorVar(t.pnl) }}>
              {t.pnl != null ? fmtCurrency(t.pnl) : '—'}
            </td>
            <td style={{ fontFamily: FONT_SANS, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {timeAgo(t.opened_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
