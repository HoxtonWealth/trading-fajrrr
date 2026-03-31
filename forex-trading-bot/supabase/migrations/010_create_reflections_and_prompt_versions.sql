CREATE TABLE IF NOT EXISTS reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_batch_start INTEGER NOT NULL,
  trade_batch_end INTEGER NOT NULL,
  patterns JSONB NOT NULL,
  recommendations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'shadow', 'retired')),
  shadow_start TIMESTAMPTZ,
  shadow_end TIMESTAMPTZ,
  performance_delta DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_agent ON prompt_versions(agent, status);
