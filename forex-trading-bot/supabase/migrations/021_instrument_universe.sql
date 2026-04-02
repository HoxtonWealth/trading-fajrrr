CREATE TABLE instrument_universe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument text UNIQUE NOT NULL,
  display_name text,
  asset_class text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'watchlist', 'removed')),
  added_reason text,
  removed_reason text,
  discovery_date timestamptz DEFAULT now(),
  last_traded timestamptz,
  performance_score float DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Seed with current 6 instruments
INSERT INTO instrument_universe (instrument, display_name, asset_class, status, added_reason) VALUES
  ('XAU_USD', 'Gold', 'commodity', 'active', 'Original instrument set'),
  ('EUR_GBP', 'EUR/GBP', 'forex', 'active', 'Original instrument set'),
  ('EUR_USD', 'EUR/USD', 'forex', 'active', 'Original instrument set'),
  ('USD_JPY', 'USD/JPY', 'forex', 'active', 'Original instrument set'),
  ('BCO_USD', 'Brent Oil', 'commodity', 'active', 'Original instrument set'),
  ('US30_USD', 'Dow Jones', 'index', 'active', 'Original instrument set');

CREATE INDEX idx_universe_status ON instrument_universe(status);
