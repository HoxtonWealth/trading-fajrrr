'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { KillSwitchButton } from './KillSwitchButton'
import { CircuitBreakerReset } from './CircuitBreakerReset'

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

  const pnlColor = (v: number | null | undefined) =>
    v == null ? 'text-text-muted' : Number(v) > 0 ? 'text-green' : Number(v) < 0 ? 'text-red' : 'text-text-muted'

  const killSwitchValue = systemState.find((s) => s.key === 'kill_switch')?.value ?? 'inactive'

  if (loading) {
    return (
      <div className="p-7">
        <div className="skeleton h-6 w-40 mb-6" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    )
  }

  const openTrades = trades.filter((t) => t.status === 'open')
  const closedTrades = trades.filter((t) => t.status !== 'open')

  return (
    <div className="flex min-h-[calc(100vh-52px)]">
      {/* Main column */}
      <div className="flex-1 p-7">
        {/* Page title */}
        <h1 className="font-serif text-[18px] font-semibold text-text-primary mb-5">Dashboard</h1>

        {/* Ticker cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <TickerCard label="Equity" value={fmtCurrency(equity?.equity)} />
          <TickerCard label="Balance" value={fmtCurrency(equity?.balance)} />
          <TickerCard
            label="Daily P&L"
            value={fmtPct(equity?.daily_pnl)}
            valueClass={pnlColor(equity?.daily_pnl)}
          />
          <TickerCard
            label="Drawdown"
            value={fmtPct(equity?.drawdown_percent ? -Math.abs(equity.drawdown_percent) : null)}
            valueClass={
              equity?.drawdown_percent != null && equity.drawdown_percent > 10
                ? 'text-red'
                : 'text-text-muted'
            }
          />
        </div>

        {/* Safety controls */}
        <div className="mb-8">
          <CircuitBreakerReset currentDrawdown={equity ? Number(equity.drawdown_percent) : 0} />
        </div>

        {/* Recent Trades */}
        <section className="mb-8">
          <h2 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Recent Trades</h2>

          {trades.length === 0 ? (
            <p className="font-serif italic text-text-muted text-center py-8">No trades yet</p>
          ) : (
            <>
              {openTrades.length > 0 && (
                <>
                  <div className="section-label mb-2">Open</div>
                  <TradesTable trades={openTrades} fmtCurrency={fmtCurrency} pnlColor={pnlColor} />
                </>
              )}
              {closedTrades.length > 0 && (
                <>
                  <div className="section-label mb-2 mt-4">Closed</div>
                  <TradesTable trades={closedTrades} fmtCurrency={fmtCurrency} pnlColor={pnlColor} />
                </>
              )}
            </>
          )}
        </section>

        {/* Agent Scorecards */}
        <section>
          <h2 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Agent Scorecards</h2>
          {scorecards.length === 0 ? (
            <p className="font-serif italic text-text-muted text-center py-8">No scorecard data yet</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  {['Agent', 'Instrument', 'Trades', 'Win Rate', 'Avg P&L', 'Weight'].map((h) => (
                    <th key={h} className="text-left font-sans text-[11px] font-medium text-text-muted py-2 px-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecards.map((s) => (
                  <tr key={s.id} className="border-b border-border-light hover:bg-bg-warm/50">
                    <td className="py-2 px-3 font-sans">{s.agent}</td>
                    <td className="py-2 px-3 font-serif font-semibold text-[14px]">{s.instrument}</td>
                    <td className="py-2 px-3 font-sans">{s.total_trades}</td>
                    <td className="py-2 px-3 font-sans">{(Number(s.win_rate) * 100).toFixed(1)}%</td>
                    <td className={`py-2 px-3 font-sans ${pnlColor(s.avg_pnl)}`}>
                      {fmtCurrency(s.avg_pnl)}
                    </td>
                    <td className="py-2 px-3 font-sans">{Number(s.weight).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Right panel */}
      <aside className="w-[320px] bg-bg-warm border-l border-border-light p-5 flex flex-col gap-6">
        {/* Bot Status */}
        <section>
          <h3 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Bot Status</h3>
          <div className="flex flex-col gap-2">
            {systemState.map((s) => (
              <div key={s.key} className="flex justify-between items-center py-1.5 border-b border-border-light">
                <span className="font-sans text-[12px] text-text-muted">{s.key}</span>
                <span className={`font-sans text-[12px] font-medium ${
                  s.key === 'kill_switch' && s.value === 'active' ? 'text-red' : 'text-text-primary'
                }`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <KillSwitchButton initialState={killSwitchValue} />
          </div>
        </section>

        {/* Active Signals */}
        <section>
          <h3 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Active Signals</h3>
          {signals.length === 0 ? (
            <p className="font-serif italic text-[13px] text-text-muted text-center py-4">No active signals</p>
          ) : (
            <div className="flex flex-col gap-2">
              {signals.map((s) => (
                <div key={s.id} className="bg-bg-surface border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-sans text-[11px] font-medium text-text-muted uppercase">
                      {s.signal_type}
                    </span>
                    <span className={s.direction === 'bullish' ? 'tag-long' : s.direction === 'bearish' ? 'tag-short' : 'font-sans text-[10px] text-text-muted'}>
                      {s.direction}
                    </span>
                  </div>
                  <p className="font-sans text-[12px] text-text-mid leading-relaxed">{s.description}</p>
                  <div className="mt-1 font-sans text-[11px] text-text-muted">
                    Strength: {Number(s.strength).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <h3 className="font-serif text-[15px] font-semibold text-text-primary mb-3">Recent Activity</h3>
          {cronLogs.length === 0 ? (
            <p className="font-serif italic text-[13px] text-text-muted text-center py-4">No activity yet</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cronLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-border-light">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.success ? 'bg-green' : 'bg-red'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-[12px] font-medium text-text-primary truncate">
                        {log.cron_name}
                      </span>
                      <span className="font-sans text-[11px] text-text-muted shrink-0 ml-2">
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                    <p className="font-sans text-[11px] text-text-muted truncate">{log.summary}</p>
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
  valueClass = 'text-text-primary',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-bg-warm border border-border-light rounded-lg px-3.5 py-3">
      <div className="font-sans text-[11px] font-medium text-text-muted uppercase">{label}</div>
      <div className={`font-serif text-[18px] font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  )
}

function TradesTable({
  trades,
  fmtCurrency,
  pnlColor,
}: {
  trades: Trade[]
  fmtCurrency: (v: number | null | undefined) => string
  pnlColor: (v: number | null | undefined) => string
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-border">
          {['Instrument', 'Direction', 'Strategy', 'Entry', 'P&L', 'Time'].map((h) => (
            <th key={h} className="text-left font-sans text-[11px] font-medium text-text-muted py-2 px-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-b border-border-light hover:bg-bg-warm/50">
            <td className="py-2 px-3 font-serif font-semibold text-[14px]">{t.instrument}</td>
            <td className="py-2 px-3">
              <span className={t.direction === 'long' ? 'tag-long' : 'tag-short'}>{t.direction}</span>
            </td>
            <td className="py-2 px-3 font-sans">{t.strategy}</td>
            <td className="py-2 px-3 font-sans">{Number(t.entry_price).toFixed(4)}</td>
            <td className={`py-2 px-3 font-sans ${pnlColor(t.pnl)}`}>
              {t.pnl != null ? fmtCurrency(t.pnl) : '—'}
            </td>
            <td className="py-2 px-3 font-sans text-[11px] text-text-muted">
              {timeAgo(t.opened_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
