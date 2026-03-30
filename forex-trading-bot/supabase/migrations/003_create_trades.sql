CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  strategy TEXT NOT NULL CHECK (strategy IN ('trend', 'mean_reversion')),
  entry_price DECIMAL NOT NULL,
  exit_price DECIMAL,
  stop_loss DECIMAL NOT NULL,
  units INTEGER NOT NULL,
  risk_percent DECIMAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled')),
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  pnl DECIMAL,
  close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument, opened_at DESC);
