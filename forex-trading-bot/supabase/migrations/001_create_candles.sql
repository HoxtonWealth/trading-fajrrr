CREATE TABLE IF NOT EXISTS candles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  granularity TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  open DECIMAL NOT NULL,
  high DECIMAL NOT NULL,
  low DECIMAL NOT NULL,
  close DECIMAL NOT NULL,
  volume INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instrument, granularity, time)
);

CREATE INDEX IF NOT EXISTS idx_candles_instrument_time ON candles(instrument, granularity, time DESC);
