import { getSupabase } from '@/lib/services/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getData() {
  const supabase = getSupabase()

  const [equity, trades, scorecards, signals, systemState] = await Promise.all([
    supabase.from('equity_snapshots').select('*').order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('trades').select('*').order('opened_at', { ascending: false }).limit(10),
    supabase.from('agent_scorecards').select('*').order('win_rate', { ascending: false }),
    supabase.from('prediction_signals').select('*').eq('status', 'active').order('strength', { ascending: false }).limit(5),
    supabase.from('system_state').select('*'),
  ])

  return {
    equity: equity.data,
    recentTrades: trades.data ?? [],
    scorecards: scorecards.data ?? [],
    activeSignals: signals.data ?? [],
    systemState: systemState.data ?? [],
  }
}

export default async function Dashboard() {
  const data = await getData()

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Forex Trading Bot — Dashboard</h1>
      <p style={{ color: '#666' }}>Read-only status page. Auto-refreshes on load.</p>

      <section style={{ marginTop: '2rem' }}>
        <h2>Account</h2>
        {data.equity ? (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr><td style={td}>Equity</td><td style={td}>${Number(data.equity.equity).toFixed(2)}</td></tr>
              <tr><td style={td}>Balance</td><td style={td}>${Number(data.equity.balance).toFixed(2)}</td></tr>
              <tr><td style={td}>Unrealized P&L</td><td style={td}>${Number(data.equity.unrealized_pnl).toFixed(2)}</td></tr>
              <tr><td style={td}>Drawdown</td><td style={td}>{Number(data.equity.drawdown_percent).toFixed(2)}%</td></tr>
              <tr><td style={td}>Daily P&L</td><td style={td}>${Number(data.equity.daily_pnl).toFixed(2)}</td></tr>
              <tr><td style={td}>Open Positions</td><td style={td}>{data.equity.open_positions}</td></tr>
            </tbody>
          </table>
        ) : <p>No equity data yet</p>}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>System State</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {data.systemState.map((s: { key: string; value: string }) => (
              <tr key={s.key}><td style={td}>{s.key}</td><td style={td}>{s.value}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Recent Trades (last 10)</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['Instrument', 'Dir', 'Strategy', 'Status', 'Entry', 'P&L', 'Time'].map(h => (
                <th key={h} style={{ ...td, fontWeight: 'bold', background: '#f0f0f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.recentTrades.map((t: any) => (
              <tr key={t.id}>
                <td style={td}>{t.instrument}</td>
                <td style={td}>{t.direction}</td>
                <td style={td}>{t.strategy}</td>
                <td style={td}>{t.status}</td>
                <td style={td}>{Number(t.entry_price).toFixed(4)}</td>
                <td style={{ ...td, color: t.pnl > 0 ? 'green' : t.pnl < 0 ? 'red' : 'inherit' }}>
                  {t.pnl != null ? `$${Number(t.pnl).toFixed(2)}` : '—'}
                </td>
                <td style={td}>{new Date(t.opened_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Agent Scorecards</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['Agent', 'Instrument', 'Trades', 'Win Rate', 'Avg P&L', 'Weight'].map(h => (
                <th key={h} style={{ ...td, fontWeight: 'bold', background: '#f0f0f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.scorecards.map((s: any) => (
              <tr key={s.id}>
                <td style={td}>{s.agent}</td>
                <td style={td}>{s.instrument}</td>
                <td style={td}>{s.total_trades}</td>
                <td style={td}>{(Number(s.win_rate) * 100).toFixed(1)}%</td>
                <td style={td}>${Number(s.avg_pnl).toFixed(2)}</td>
                <td style={td}>{Number(s.weight).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Active PM Signals</h2>
        {data.activeSignals.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['Type', 'Description', 'Strength', 'Direction'].map(h => (
                  <th key={h} style={{ ...td, fontWeight: 'bold', background: '#f0f0f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.activeSignals.map((s: any) => (
                <tr key={s.id}>
                  <td style={td}>{s.signal_type}</td>
                  <td style={td}>{s.description}</td>
                  <td style={td}>{Number(s.strength).toFixed(2)}</td>
                  <td style={td}>{s.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>No active prediction market signals</p>}
      </section>
    </main>
  )
}

const td: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '6px 10px',
  textAlign: 'left',
}
