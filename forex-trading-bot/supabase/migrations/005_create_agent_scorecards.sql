CREATE TABLE IF NOT EXISTS agent_scorecards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent TEXT NOT NULL,
  instrument TEXT NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL NOT NULL DEFAULT 0,
  avg_pnl DECIMAL NOT NULL DEFAULT 0,
  total_pnl DECIMAL NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent, instrument)
);

CREATE INDEX IF NOT EXISTS idx_scorecards_agent ON agent_scorecards(agent, instrument);
