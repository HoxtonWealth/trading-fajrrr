-- Migration 022: Add deal_id to trades for Capital.com position reconciliation
ALTER TABLE trades ADD COLUMN IF NOT EXISTS deal_id TEXT;
CREATE INDEX IF NOT EXISTS idx_trades_deal_id ON trades(deal_id) WHERE deal_id IS NOT NULL;
