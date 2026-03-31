CREATE TABLE IF NOT EXISTS news_sentiment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  score DECIMAL NOT NULL DEFAULT 0,
  headline_count INTEGER NOT NULL DEFAULT 0,
  headlines JSONB,
  source TEXT NOT NULL DEFAULT 'finnhub',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_sentiment_instrument ON news_sentiment(instrument, created_at DESC);
