'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

interface EquitySnapshot {
  equity: number | null
  daily_pnl: number | null
  drawdown_percent: number | null
}

export function Header() {
  const [equity, setEquity] = useState<EquitySnapshot | null>(null)
  const [killSwitch, setKillSwitch] = useState<string>('inactive')

  useEffect(() => {
    // Initial fetch
    supabase
      .from('equity_snapshots')
      .select('equity, daily_pnl, drawdown_percent')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setEquity(data)
      })

    supabase
      .from('system_state')
      .select('value')
      .eq('key', 'kill_switch')
      .single()
      .then(({ data }) => {
        if (data) setKillSwitch(data.value)
      })

    // Realtime subscriptions
    const equityChannel = supabase
      .channel('header-equity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'equity_snapshots' },
        (payload) => {
          const row = payload.new as EquitySnapshot
          setEquity(row)
        }
      )
      .subscribe()

    const stateChannel = supabase
      .channel('header-state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          const row = payload.new as { key: string; value: string }
          if (row.key === 'kill_switch') setKillSwitch(row.value)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(equityChannel)
      supabase.removeChannel(stateChannel)
    }
  }, [])

  const fmtCurrency = (v: number | null | undefined) =>
    v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'

  const pnlColor = (v: number | null | undefined) =>
    v == null ? 'text-text-muted' : v >= 0 ? 'text-green' : 'text-red'

  const isKillActive = killSwitch === 'active'

  return (
    <header style={{ height: 52 }} className="border-b border-border/50 px-7 flex items-center justify-between bg-bg-surface">
      {/* Left: equity stats */}
      <div className="flex items-center gap-6">
        <StatItem label="Equity" value={fmtCurrency(equity?.equity)} />
        <StatItem
          label="Daily P&L"
          value={fmtPct(equity?.daily_pnl)}
          valueClass={pnlColor(equity?.daily_pnl)}
        />
        <StatItem
          label="Drawdown"
          value={fmtPct(equity?.drawdown_percent ? -Math.abs(equity.drawdown_percent) : equity?.drawdown_percent)}
          valueClass={
            equity?.drawdown_percent != null && equity.drawdown_percent > 10
              ? 'text-red'
              : 'text-text-muted'
          }
        />
      </div>

      {/* Right: badges */}
      <div className="flex items-center gap-2">
        <span className="font-sans text-[11px] font-medium px-3 py-1 rounded-md border border-green/50 text-green bg-green-bg">
          Live
        </span>
        <span
          className={`font-sans text-[11px] font-medium px-3 py-1 rounded-md border ${
            isKillActive
              ? 'border-red text-red bg-red-bg'
              : 'border-border text-text-muted'
          }`}
        >
          Kill Switch {isKillActive ? 'ON' : 'Off'}
        </span>
      </div>
    </header>
  )
}

function StatItem({
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="font-sans text-[11px] text-text-muted font-medium">{label}</span>
      <span className={`font-sans text-[13px] font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}
