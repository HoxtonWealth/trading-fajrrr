CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger TEXT NOT NULL,
  message TEXT NOT NULL,
  positions_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breaker_events_created ON circuit_breaker_events(created_at DESC);
