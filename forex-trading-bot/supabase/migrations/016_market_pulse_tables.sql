-- Migration 016: Market Pulse tables
-- Supports the /markets page: asset registry, daily price snapshots, AI analyses, and news cache

-- 1. Market Assets (instrument registry)
CREATE TABLE market_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  epic TEXT,
  yahoo_ticker TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('equities','currencies','commodities','bonds','crypto','volatility')),
  data_source TEXT NOT NULL CHECK (data_source IN ('capital','external')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Market Prices (daily snapshots)
CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES market_assets(id),
  price NUMERIC NOT NULL,
  change_24h_pct NUMERIC,
  change_1w_pct NUMERIC,
  change_1q_pct NUMERIC,
  price_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, price_date)
);

CREATE INDEX idx_market_prices_asset_date ON market_prices (asset_id, recorded_at DESC);

-- 3. Market Analyses (AI daily briefings)
CREATE TABLE market_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_date DATE UNIQUE NOT NULL,
  market_summary TEXT,
  key_movers JSONB,
  geopolitical_watch TEXT,
  week_ahead TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. News Cache (GDELT geopolitical + market headlines)
CREATE TABLE news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT UNIQUE NOT NULL,
  url TEXT,
  source TEXT,
  category TEXT NOT NULL DEFAULT 'market' CHECK (category IN ('market','geopolitical')),
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_cache_category_date ON news_cache (category, fetched_at DESC);

-- 5. RLS Policies
ALTER TABLE market_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_cache ENABLE ROW LEVEL SECURITY;

-- Anon: SELECT only
CREATE POLICY "market_assets_anon_select" ON market_assets FOR SELECT TO anon USING (true);
CREATE POLICY "market_prices_anon_select" ON market_prices FOR SELECT TO anon USING (true);
CREATE POLICY "market_analyses_anon_select" ON market_analyses FOR SELECT TO anon USING (true);
CREATE POLICY "news_cache_anon_select" ON news_cache FOR SELECT TO anon USING (true);

-- Service role: full access
CREATE POLICY "market_assets_service_all" ON market_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "market_prices_service_all" ON market_prices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "market_analyses_service_all" ON market_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "news_cache_service_all" ON news_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Seed market_assets with 28 instruments

-- Capital.com instruments (data_source = 'capital')
INSERT INTO market_assets (symbol, epic, name, category, data_source) VALUES
  ('SPX500_USD', 'US500',          'S&P 500',      'equities',    'capital'),
  ('NAS100_USD', 'USTEC',          'NASDAQ 100',    'equities',    'capital'),
  ('US30_USD',   'US30',           'Dow Jones',     'equities',    'capital'),
  ('DE30_EUR',   'DE40',           'DAX',           'equities',    'capital'),
  ('UK100_GBP',  'UK100',          'FTSE 100',      'equities',    'capital'),
  ('JP225_USD',  'JP225',          'Nikkei 225',    'equities',    'capital'),
  ('EUR_USD',    'EURUSD',         'EUR/USD',       'currencies',  'capital'),
  ('GBP_USD',    'GBPUSD',         'GBP/USD',       'currencies',  'capital'),
  ('USD_JPY',    'USDJPY',         'USD/JPY',       'currencies',  'capital'),
  ('USD_CHF',    'USDCHF',         'USD/CHF',       'currencies',  'capital'),
  ('XAU_USD',    'GOLD',           'Gold',          'commodities', 'capital'),
  ('XAG_USD',    'SILVER',         'Silver',        'commodities', 'capital'),
  ('BCO_USD',    'OIL_CRUDE',      'Brent Oil',     'commodities', 'capital'),
  ('WTICO_USD',  'OIL_CRUDE_WTI',  'WTI Oil',       'commodities', 'capital'),
  ('NATGAS_USD', 'NATURALGAS',     'Natural Gas',   'commodities', 'capital'),
  ('BTC_USD',    'BTCUSD',         'Bitcoin',       'crypto',      'capital'),
  ('ETH_USD',    'ETHUSD',         'Ethereum',      'crypto',      'capital'),
  ('VIX',        'VIX',            'VIX',           'volatility',  'capital');

-- External instruments (data_source = 'external', yahoo_ticker)
INSERT INTO market_assets (symbol, yahoo_ticker, name, category, data_source) VALUES
  ('CN50_USD',    '2823.HK',   'China A50',     'equities',    'external'),
  ('DXY',         'DX-Y.NYB',  'Dollar Index',  'currencies',  'external'),
  ('HG_USD',      'HG=F',      'Copper',        'commodities', 'external'),
  ('USB10Y_USD',  '^TNX',      'US 10Y Yield',  'bonds',       'external'),
  ('USB02Y_USD',  '^IRX',      'US 2Y Yield',   'bonds',       'external'),
  ('DE10YB_EUR',  'DE10Y.DE',  'German 10Y',    'bonds',       'external');
