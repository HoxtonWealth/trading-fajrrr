CREATE TABLE IF NOT EXISTS equity_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equity DECIMAL NOT NULL,
  balance DECIMAL NOT NULL,
  unrealized_pnl DECIMAL NOT NULL,
  open_positions INTEGER NOT NULL DEFAULT 0,
  daily_pnl DECIMAL NOT NULL DEFAULT 0,
  drawdown_percent DECIMAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equity_snapshots_created ON equity_snapshots(created_at DESC);
