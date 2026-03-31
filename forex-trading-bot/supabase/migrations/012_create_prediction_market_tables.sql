CREATE TABLE IF NOT EXISTS pm_markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('polymarket', 'kalshi', 'metaculus')),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  instruments TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS pm_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES pm_markets(id),
  probability DECIMAL NOT NULL,
  volume DECIMAL NOT NULL DEFAULT 0,
  velocity DECIMAL,
  acceleration DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_snapshots_market ON pm_snapshots(market_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prediction_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID REFERENCES pm_markets(id),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('momentum', 'divergence', 'threshold', 'llm_scenario')),
  description TEXT NOT NULL,
  strength DECIMAL NOT NULL,
  instruments TEXT[] NOT NULL DEFAULT '{}',
  direction TEXT CHECK (direction IN ('bullish', 'bearish', 'neutral')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'blocked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_signals_status ON prediction_signals(status, created_at DESC);

-- Seed relevant markets
INSERT INTO pm_markets (platform, external_id, title, category, instruments) VALUES
  ('kalshi', 'KXFED', 'Fed Rate Decision', 'rates', ARRAY['EUR_USD', 'USD_JPY', 'XAU_USD', 'US30_USD']),
  ('kalshi', 'KXCPI', 'CPI Monthly', 'inflation', ARRAY['EUR_USD', 'XAU_USD', 'US30_USD']),
  ('kalshi', 'KXGDP', 'GDP Growth', 'growth', ARRAY['EUR_USD', 'US30_USD']),
  ('kalshi', 'KXUNRATE', 'Unemployment Rate', 'employment', ARRAY['EUR_USD', 'USD_JPY', 'US30_USD']),
  ('polymarket', 'us-recession-2026', 'US Recession 2026', 'recession', ARRAY['XAU_USD', 'US30_USD', 'EUR_USD']),
  ('polymarket', 'fed-rate-cut-2026', 'Fed Rate Cut 2026', 'rates', ARRAY['EUR_USD', 'USD_JPY', 'XAU_USD']),
  ('polymarket', 'oil-above-80-2026', 'Oil Above $80 2026', 'energy', ARRAY['BCO_USD']),
  ('polymarket', 'sp500-above-6000', 'S&P 500 Above 6000', 'equities', ARRAY['US30_USD']),
  ('polymarket', 'us-tariffs-escalation', 'US Tariff Escalation', 'trade', ARRAY['EUR_USD', 'USD_JPY', 'XAU_USD']),
  ('polymarket', 'ecb-rate-decision', 'ECB Rate Decision', 'rates', ARRAY['EUR_USD', 'EUR_GBP']),
  ('polymarket', 'boe-rate-decision', 'BOE Rate Decision', 'rates', ARRAY['EUR_GBP']),
  ('polymarket', 'gold-above-3000', 'Gold Above $3000', 'commodities', ARRAY['XAU_USD']),
  ('polymarket', 'china-stimulus', 'China Major Stimulus', 'geopolitical', ARRAY['XAU_USD', 'BCO_USD', 'US30_USD']),
  ('polymarket', 'japan-intervention', 'Japan FX Intervention', 'rates', ARRAY['USD_JPY']),
  ('polymarket', 'opec-production-cut', 'OPEC Production Cut', 'energy', ARRAY['BCO_USD'])
ON CONFLICT (platform, external_id) DO NOTHING;
