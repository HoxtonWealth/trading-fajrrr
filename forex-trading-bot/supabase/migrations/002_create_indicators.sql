CREATE TABLE IF NOT EXISTS indicators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  granularity TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  ema_20 DECIMAL,
  ema_50 DECIMAL,
  adx_14 DECIMAL,
  atr_14 DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instrument, granularity, time)
);

CREATE INDEX IF NOT EXISTS idx_indicators_instrument_time ON indicators(instrument, granularity, time DESC);
