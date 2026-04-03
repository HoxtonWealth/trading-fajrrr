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
  weight: number
  last_updated: string
  created_at: string
}

export interface MarketAssetRow {
  id: string
  symbol: string
  epic: string | null
  yahoo_ticker: string | null
  name: string
  category: 'equities' | 'currencies' | 'commodities' | 'bonds' | 'crypto' | 'volatility'
  data_source: 'capital' | 'external'
  enabled: boolean
  created_at: string
}

export interface MarketPriceRow {
  id: string
  asset_id: string
  price: number
  change_24h_pct: number | null
  change_1w_pct: number | null
  change_1q_pct: number | null
  price_date: string
  recorded_at: string
}

export interface MarketAnalysisRow {
  id: string
  analysis_date: string
  market_summary: string | null
  key_movers: Array<{ instrument: string; change: string; explanation: string }> | null
  geopolitical_watch: string | null
  week_ahead: string | null
  raw_data: unknown
  created_at: string
}

export interface NewsCacheRow {
  id: string
  title: string
  url: string | null
  source: string | null
  category: 'market' | 'geopolitical'
  published_at: string | null
  fetched_at: string
}

export interface TradeLessonRow {
  id: string
  trade_id: string
  instrument: string
  direction: string
  process_quality: number
  entry_quality: number
  exit_quality: number
  would_take_again: boolean
  tags: string[]
  market_condition: string
  lesson: string
  win_rate_context: Record<string, unknown>
  created_at: string
}

export interface InstrumentUniverseRow {
  id: string
  instrument: string
  display_name: string | null
  asset_class: string | null
  status: 'active' | 'watchlist' | 'removed'
  added_reason: string | null
  removed_reason: string | null
  discovery_date: string
  last_traded: string | null
  performance_score: number
  updated_at: string
}
