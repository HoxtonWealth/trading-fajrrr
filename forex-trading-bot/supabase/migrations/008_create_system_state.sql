CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_state (key, value) VALUES ('trading_enabled', 'true') ON CONFLICT DO NOTHING;
INSERT INTO system_state (key, value) VALUES ('weekend_mode', 'false') ON CONFLICT DO NOTHING;
