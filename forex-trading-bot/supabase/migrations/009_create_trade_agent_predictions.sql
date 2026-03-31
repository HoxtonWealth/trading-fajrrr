CREATE TABLE IF NOT EXISTS trade_agent_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  agent TEXT NOT NULL,
  predicted_signal TEXT NOT NULL,
  confidence DECIMAL NOT NULL,
  chief_decision TEXT NOT NULL,
  actual_outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_instrument ON trade_agent_predictions(instrument, created_at DESC);

-- Add weight column to agent_scorecards for Darwinian weights
ALTER TABLE agent_scorecards ADD COLUMN IF NOT EXISTS weight DECIMAL NOT NULL DEFAULT 1.0;
