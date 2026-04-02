-- Fix RLS: allow authenticated role to write to market tables
-- (service_role should bypass RLS entirely, but adding explicit policies as safety net)

CREATE POLICY "market_prices_authenticated_all" ON market_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "market_analyses_authenticated_all" ON market_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "news_cache_authenticated_all" ON news_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon to insert (for serverless functions that may connect as anon)
DROP POLICY IF EXISTS "market_prices_anon_select" ON market_prices;
CREATE POLICY "market_prices_anon_all" ON market_prices FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "market_analyses_anon_select" ON market_analyses;
CREATE POLICY "market_analyses_anon_all" ON market_analyses FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "news_cache_anon_select" ON news_cache;
CREATE POLICY "news_cache_anon_all" ON news_cache FOR ALL TO anon USING (true) WITH CHECK (true);
