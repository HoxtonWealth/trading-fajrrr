CREATE TABLE trade_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES trades(id),
  instrument text NOT NULL,
  direction text NOT NULL,
  process_quality smallint CHECK (process_quality BETWEEN 1 AND 5),
  entry_quality smallint CHECK (entry_quality BETWEEN 1 AND 5),
  exit_quality smallint CHECK (exit_quality BETWEEN 1 AND 5),
  would_take_again boolean,
  tags text[] DEFAULT '{}',
  market_condition text,
  lesson text,
  win_rate_context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lessons_instrument ON trade_lessons(instrument);
CREATE INDEX idx_lessons_created ON trade_lessons(created_at DESC);
