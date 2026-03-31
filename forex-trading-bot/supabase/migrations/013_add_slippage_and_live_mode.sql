-- Slippage tracking columns
ALTER TABLE trades ADD COLUMN IF NOT EXISTS expected_price DECIMAL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS actual_price DECIMAL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS slippage DECIMAL;

-- Live mode system state
INSERT INTO system_state (key, value) VALUES ('trading_mode', 'practice') ON CONFLICT DO NOTHING;
INSERT INTO system_state (key, value) VALUES ('size_multiplier', '0.5') ON CONFLICT DO NOTHING;
