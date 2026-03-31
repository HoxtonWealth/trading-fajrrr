CREATE TABLE IF NOT EXISTS economic_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL,
  country TEXT NOT NULL,
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  event_time TIMESTAMPTZ NOT NULL,
  actual TEXT,
  estimate TEXT,
  previous TEXT,
  source TEXT NOT NULL DEFAULT 'finnhub',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_name, event_time)
);

CREATE INDEX IF NOT EXISTS idx_economic_events_time ON economic_events(event_time);
CREATE INDEX IF NOT EXISTS idx_economic_events_impact ON economic_events(impact, event_time);
