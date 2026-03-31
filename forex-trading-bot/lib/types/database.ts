export interface CandleRow {
  id: string
  instrument: string
  granularity: string
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  created_at: string
}

export interface IndicatorRow {
  id: string
  instrument: string
  granularity: string
  time: string
  ema_20: number
  ema_50: number
  adx_14: number
  atr_14: number
  rsi_14: number | null
  bb_upper: number | null
  bb_middle: number | null
  bb_lower: number | null
  created_at: string
}

export interface TradeRow {
  id: string
  instrument: string
  direction: 'long' | 'short'
  strategy: 'trend' | 'mean_reversion'
  entry_price: number
  exit_price: number | null
  stop_loss: number
  units: number
  risk_percent: number
  status: 'pending' | 'open' | 'closed' | 'cancelled'
  opened_at: string
  closed_at: string | null
  pnl: number | null
  close_reason: string | null
  created_at: string
}

export interface EquitySnapshotRow {
  id: string
  equity: number
  balance: number
  unrealized_pnl: number
  open_positions: number
  daily_pnl: number
  drawdown_percent: number
  created_at: string
}

export interface AgentScorecardRow {
  id: string
  agent: string
  instrument: string
  total_trades: number
  wins: number
  losses: number
  win_rate: number
  avg_pnl: number
  total_pnl: number
  last_updated: string
  created_at: string
}
