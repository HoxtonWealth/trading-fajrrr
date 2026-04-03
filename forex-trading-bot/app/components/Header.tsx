'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif"

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
    v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'

  const pnlColor = (v: number | null | undefined) =>
    v == null ? 'var(--color-text-muted)' : v >= 0 ? 'var(--color-green)' : 'var(--color-red)'

  const isKillActive = killSwitch === 'active'

  return (
    <header
      style={{
        height: 52,
        padding: '0 28px',
        borderBottom: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-surface)',
      }}
      className="flex items-center justify-between"
    >
      {/* Left: equity stats */}
      <div className="flex items-center" style={{ gap: 32 }}>
        <StatItem label="Equity" value={fmtCurrency(equity?.equity)} />
        <StatItem
          label="Daily P&L"
          value={fmtPct(equity?.daily_pnl)}
          valueColor={pnlColor(equity?.daily_pnl)}
        />
        <StatItem
          label="Drawdown"
          value={fmtPct(equity?.drawdown_percent ? -Math.abs(equity.drawdown_percent) : equity?.drawdown_percent)}
          valueColor={
            equity?.drawdown_percent != null && equity.drawdown_percent > 10
              ? 'var(--color-red)'
              : 'var(--color-text-muted)'
          }
        />
      </div>

      {/* Right: badges */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 500,
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--color-green)',
            color: 'var(--color-green)',
            backgroundColor: 'var(--color-green-bg)',
          }}
        >
          Live
        </span>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 500,
            padding: '4px 12px',
            borderRadius: 6,
            border: `1px solid ${isKillActive ? 'var(--color-red)' : 'var(--color-border)'}`,
            color: isKillActive ? 'var(--color-red)' : 'var(--color-text-muted)',
            backgroundColor: isKillActive ? 'var(--color-red-bg)' : 'transparent',
          }}
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
  valueColor = 'var(--color-text-primary)',
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex flex-col">
      <span
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
      </span>
      <span
        style={{
          fontFamily: FONT_SANS,
          fontSize: 14,
          fontWeight: 600,
          color: valueColor,
          marginTop: 1,
        }}
      >
        {value}
      </span>
    </div>
  )
}
