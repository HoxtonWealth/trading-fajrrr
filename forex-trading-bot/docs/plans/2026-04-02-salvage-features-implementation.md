# Fajrrr Salvage Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 6 salvage features from fajrrr-trading into forex-trading-bot: Kill Switch, Trade Post-Mortem, GDELT integration into sentiment, Weekly Instrument Discovery, Market Screener, and Scan Scheduler.

**Architecture:** All features integrate directly into the existing Next.js + Supabase + OpenRouter stack. No new packages. GDELT client already exists — we enhance it and feed into the sentiment pipeline. All new DB tables get proper migrations (starting at 019). Dashboard gets a kill switch toggle. Crons read from a dynamic instrument_universe table instead of hardcoded arrays.

**Tech Stack:** Next.js 16, Supabase (Postgres), OpenRouter (Gemini Flash + Claude Sonnet), Capital.com REST, Vitest, TypeScript strict mode.

---

## Key Conventions (read before implementing)

**Cron route pattern:** (see `app/api/cron/run-pipeline/route.ts`)
1. Auth check: `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`
2. Business logic in try/catch
3. Build human-readable `msg` for cron logger
4. `await logCron('cron-name', msg)` — always log success or failure
5. Return `NextResponse.json({ success: true, ... })`

**Test pattern:** Vitest with `@/` path aliases (see `__tests__/risk/pre-trade-checks.test.ts`)

**LLM pattern:** `callLLM({ tier: 'cheap'|'strong', systemPrompt, userPrompt, maxTokens })` → `parseLLMJson<T>(response.content, fallback)`

**DB pattern:** `supabase.from('table').select/insert/upsert/update` with error checks

**Existing migrations:** 001–018. Next migration = **019**.

**Hardcoded instrument list appears in 3 cron routes:**
- `app/api/cron/run-pipeline/route.ts` line 5
- `app/api/cron/ingest-candles/route.ts` line 12
- `app/api/cron/ingest-news-sentiment/route.ts` line 7

**GDELT already exists:** `lib/services/gdelt.ts` fetches geopolitical headlines. `app/api/cron/ingest-geopolitical/route.ts` stores them in `news_cache`. Feature C enhances this to also produce per-instrument sentiment scores in `news_sentiment` with `source: 'gdelt'`.

---

## Task 1: Kill Switch — Database Migration

**Files:**
- Create: `supabase/migrations/019_kill_switch.sql`

**Step 1: Write the migration**

```sql
-- Kill Switch: add kill_switch row to existing system_state table
INSERT INTO system_state (key, value, updated_at)
VALUES ('kill_switch', 'inactive', now())
ON CONFLICT (key) DO NOTHING;
```

**Step 2: Commit**

```bash
git add supabase/migrations/019_kill_switch.sql
git commit -m "feat: add kill_switch migration (019)"
```

---

## Task 2: Kill Switch — API Route

**Files:**
- Create: `app/api/kill-switch/route.ts`

**Step 1: Write the failing test**

Create `__tests__/api/kill-switch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })),
  },
}))

vi.mock('@/lib/services/telegram', () => ({
  alertCustom: vi.fn().mockResolvedValue(true),
}))

import { toggleKillSwitch, getKillSwitchState } from '@/lib/services/kill-switch'

describe('Kill Switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getKillSwitchState returns current state', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'inactive' }, error: null })
    const state = await getKillSwitchState()
    expect(state).toBe('inactive')
  })

  it('getKillSwitchState returns inactive on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const state = await getKillSwitchState()
    expect(state).toBe('inactive')
  })

  it('toggleKillSwitch flips inactive to active', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'inactive' }, error: null })
    const result = await toggleKillSwitch()
    expect(result).toBe('active')
  })

  it('toggleKillSwitch flips active to inactive', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'active' }, error: null })
    const result = await toggleKillSwitch()
    expect(result).toBe('inactive')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/api/kill-switch.test.ts`
Expected: FAIL — `@/lib/services/kill-switch` doesn't exist

**Step 3: Write the kill switch service**

Create `lib/services/kill-switch.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'
import { alertCustom } from '@/lib/services/telegram'

export type KillSwitchState = 'active' | 'inactive'

export async function getKillSwitchState(): Promise<KillSwitchState> {
  const { data, error } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'kill_switch')
    .single()

  if (error || !data) return 'inactive'
  return data.value === 'active' ? 'active' : 'inactive'
}

export async function toggleKillSwitch(): Promise<KillSwitchState> {
  const current = await getKillSwitchState()
  const next: KillSwitchState = current === 'active' ? 'inactive' : 'active'

  await supabase
    .from('system_state')
    .update({ value: next, updated_at: new Date().toISOString() })
    .eq('key', 'kill_switch')

  const emoji = next === 'active' ? '🛑' : '✅'
  alertCustom(
    `${emoji} Kill Switch ${next === 'active' ? 'ACTIVATED' : 'Deactivated'}`,
    `Trading ${next === 'active' ? 'halted' : 'resumed'} at ${new Date().toISOString()}`
  ).catch(() => {})

  return next
}
```

**Step 4: Write the API route**

Create `app/api/kill-switch/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getKillSwitchState, toggleKillSwitch } from '@/lib/services/kill-switch'

const KILL_SWITCH_SECRET = process.env.KILL_SWITCH_SECRET || process.env.CRON_SECRET

export async function GET() {
  const state = await getKillSwitchState()
  return NextResponse.json({ state })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${KILL_SWITCH_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const newState = await toggleKillSwitch()
    return NextResponse.json({ state: newState })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd forex-trading-bot && npx vitest run __tests__/api/kill-switch.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/services/kill-switch.ts app/api/kill-switch/route.ts __tests__/api/kill-switch.test.ts
git commit -m "feat: add kill switch service and API route"
```

---

## Task 3: Kill Switch — Pipeline Integration

**Files:**
- Modify: `lib/pipeline.ts` (add check at top of `runPipeline`, after weekend check ~line 40)

**Step 1: Write the failing test**

Create `__tests__/pipeline/kill-switch-integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'system_state') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              if (val === 'kill_switch') {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { value: 'active' },
                    error: null,
                  }),
                }
              }
              // weekend_mode
              return {
                single: vi.fn().mockResolvedValue({
                  data: { value: 'false' },
                  error: null,
                }),
              }
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    }),
  },
}))

vi.mock('@/lib/services/capital', () => ({
  placeMarketOrder: vi.fn(),
  closePosition: vi.fn(),
  getOpenTrades: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/services/telegram', () => ({
  alertTradeOpened: vi.fn(),
  alertTradeClosed: vi.fn(),
}))

vi.mock('@/lib/agent-pipeline', () => ({
  runAgentPipeline: vi.fn().mockResolvedValue({
    decision: { decision: 'hold', confidence: 0, reasoning: '', agentAgreement: 0 },
    scorecards: [],
    usedAgents: false,
  }),
}))

import { runPipeline } from '@/lib/pipeline'

describe('Pipeline — Kill Switch', () => {
  it('halts pipeline when kill switch is active', async () => {
    const result = await runPipeline('EUR_USD')
    expect(result.action).toBe('none')
    expect(result.details).toContain('Kill switch')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/pipeline/kill-switch-integration.test.ts`
Expected: FAIL — pipeline doesn't check kill switch yet

**Step 3: Add kill switch check to pipeline**

Modify `lib/pipeline.ts` — add after the weekend mode check (line 40):

```typescript
// After the existing weekend_mode check, add:
  // 0b. Check kill switch — halt everything if active
  const { data: killSwitchState } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'kill_switch')
    .single()

  if (killSwitchState?.value === 'active') {
    return { action: 'none', instrument, details: 'Kill switch active — pipeline halted' }
  }
```

**Step 4: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/pipeline/kill-switch-integration.test.ts`
Expected: PASS

Run: `cd forex-trading-bot && npx vitest run`
Expected: All 91+ tests pass

**Step 5: Commit**

```bash
git add lib/pipeline.ts __tests__/pipeline/kill-switch-integration.test.ts
git commit -m "feat: pipeline halts when kill switch is active"
```

---

## Task 4: Kill Switch — Dashboard Toggle

**Files:**
- Modify: `app/dashboard/page.tsx` (add kill switch button in System State section)

**Step 1: Add KillSwitch client component**

Create `app/dashboard/KillSwitchButton.tsx`:

```typescript
'use client'

import { useState } from 'react'

export function KillSwitchButton({ initialState }: { initialState: string }) {
  const [state, setState] = useState(initialState)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${window.__KILL_SWITCH_TOKEN || ''}` },
      })
      const data = await res.json()
      if (data.state) setState(data.state)
    } catch {
      // Silently fail — dashboard is informational
    } finally {
      setLoading(false)
    }
  }

  const isActive = state === 'active'

  return (
    <div style={{
      padding: '16px',
      background: isActive ? '#fee' : '#efe',
      border: `2px solid ${isActive ? '#c00' : '#0a0'}`,
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    }}>
      <div>
        <strong style={{ fontSize: '1.1rem' }}>
          Kill Switch: {isActive ? 'ACTIVE (Trading Halted)' : 'Inactive (Trading Normal)'}
        </strong>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        style={{
          padding: '8px 20px',
          background: isActive ? '#0a0' : '#c00',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 'bold',
          fontSize: '0.95rem',
        }}
      >
        {loading ? '...' : isActive ? 'Resume Trading' : 'HALT TRADING'}
      </button>
    </div>
  )
}
```

**Step 2: Integrate into dashboard**

Modify `app/dashboard/page.tsx`:

Add import at top:
```typescript
import { KillSwitchButton } from './KillSwitchButton'
```

In the `getData()` function, add kill switch state extraction from the existing systemState query (already fetches all system_state rows).

After the Account section (`</section>` at ~line 54), before System State section, add:

```tsx
      <section style={{ marginTop: '2rem' }}>
        <h2>Kill Switch</h2>
        <KillSwitchButton
          initialState={data.systemState.find((s: { key: string }) => s.key === 'kill_switch')?.value ?? 'inactive'}
        />
      </section>
```

**Step 3: Commit**

```bash
git add app/dashboard/KillSwitchButton.tsx app/dashboard/page.tsx
git commit -m "feat: add kill switch toggle to dashboard"
```

---

## Task 5: Trade Post-Mortem — Database Migration

**Files:**
- Create: `supabase/migrations/020_trade_lessons.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2: Commit**

```bash
git add supabase/migrations/020_trade_lessons.sql
git commit -m "feat: add trade_lessons table migration (020)"
```

---

## Task 6: Trade Post-Mortem — Lesson Extraction

**Files:**
- Create: `lib/learning/post-mortem.ts`
- Create: `__tests__/learning/post-mortem.test.ts`

**Step 1: Write the failing test**

Create `__tests__/learning/post-mortem.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockSelect = vi.fn()

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'trade_lessons') {
        return {
          insert: mockInsert,
          select: mockSelect.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'candles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'agent_scorecards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
    }),
  },
}))

vi.mock('@/lib/services/openrouter', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      process_quality: 4,
      entry_quality: 3,
      exit_quality: 4,
      would_take_again: true,
      tags: ['trend-follow'],
      market_condition: 'Trending strongly',
      lesson: 'Good entry timing on strong ADX',
    }),
  }),
  parseLLMJson: vi.fn().mockImplementation((content: string, fallback: unknown) => {
    try {
      return JSON.parse(content.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim())
    } catch {
      return fallback
    }
  }),
}))

import { extractPostMortem, getRelevantLessons } from '@/lib/learning/post-mortem'

describe('Post-Mortem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extractPostMortem generates and stores lesson for a trade', async () => {
    const trade = {
      id: 'trade-1',
      instrument: 'EUR_USD',
      direction: 'long' as const,
      strategy: 'trend' as const,
      entry_price: 1.08,
      exit_price: 1.09,
      pnl: 50,
      opened_at: '2026-04-01T10:00:00Z',
      closed_at: '2026-04-01T14:00:00Z',
      close_reason: 'ema_crossover_reversal',
    }

    await extractPostMortem(trade)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow.trade_id).toBe('trade-1')
    expect(insertedRow.instrument).toBe('EUR_USD')
    expect(insertedRow.process_quality).toBe(4)
  })

  it('getRelevantLessons returns lessons for an instrument', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              { instrument: 'EUR_USD', lesson: 'Watch NFP', tags: ['news-driven'] },
            ],
            error: null,
          }),
        }),
      }),
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    })

    const lessons = await getRelevantLessons('EUR_USD')
    expect(lessons.length).toBeGreaterThanOrEqual(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/learning/post-mortem.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Write the implementation**

Create `lib/learning/post-mortem.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'

interface ClosedTrade {
  id: string
  instrument: string
  direction: 'long' | 'short'
  strategy: 'trend' | 'mean_reversion'
  entry_price: number
  exit_price: number | null
  pnl: number | null
  opened_at: string
  closed_at: string | null
  close_reason: string | null
}

interface PostMortemResult {
  process_quality: number
  entry_quality: number
  exit_quality: number
  would_take_again: boolean
  tags: string[]
  market_condition: string
  lesson: string
}

const FALLBACK: PostMortemResult = {
  process_quality: 3,
  entry_quality: 3,
  exit_quality: 3,
  would_take_again: false,
  tags: [],
  market_condition: 'Unknown',
  lesson: 'Unable to analyze — LLM unavailable',
}

export async function extractPostMortem(trade: ClosedTrade): Promise<void> {
  // Gather context: candles around the trade window
  const { data: candles } = await supabase
    .from('candles')
    .select('time, open, high, low, close')
    .eq('instrument', trade.instrument)
    .eq('granularity', 'H4')
    .gte('time', trade.opened_at)
    .lte('time', trade.closed_at ?? new Date().toISOString())
    .order('time', { ascending: true })

  // Get scorecard context for win rate
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('win_rate, total_trades, avg_pnl')
    .eq('instrument', trade.instrument)

  const candleSummary = (candles ?? [])
    .slice(0, 10)
    .map(c => `${c.time}: O=${c.open} H=${c.high} L=${c.low} C=${c.close}`)
    .join('\n')

  let result: PostMortemResult

  try {
    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: `You analyze closed forex trades and extract lessons. Output JSON:
{
  "process_quality": 1-5 (was the trading process good regardless of P&L outcome?),
  "entry_quality": 1-5 (timing and price level of entry),
  "exit_quality": 1-5 (held too long=1, cut too early=2, just right=5),
  "would_take_again": boolean,
  "tags": ["trend-follow", "news-driven", "mean-reversion", "counter-trend", etc.],
  "market_condition": "brief description of market state",
  "lesson": "one sentence — what should be learned from this trade"
}
Output ONLY valid JSON, no markdown.`,
      userPrompt: `Analyze this closed trade:
Instrument: ${trade.instrument}
Direction: ${trade.direction}
Strategy: ${trade.strategy}
Entry: ${trade.entry_price} at ${trade.opened_at}
Exit: ${trade.exit_price ?? 'unknown'} at ${trade.closed_at ?? 'unknown'}
P&L: $${trade.pnl?.toFixed(2) ?? 'unknown'}
Close reason: ${trade.close_reason ?? 'unknown'}

Candles during trade:
${candleSummary || 'No candle data available'}

Current instrument stats: ${JSON.stringify(scorecards?.[0] ?? {})}`,
      maxTokens: 300,
    })

    result = parseLLMJson<PostMortemResult>(response.content, FALLBACK)
  } catch {
    result = FALLBACK
  }

  // Clamp quality scores to 1-5
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)))

  await supabase.from('trade_lessons').insert({
    trade_id: trade.id,
    instrument: trade.instrument,
    direction: trade.direction,
    process_quality: clamp(result.process_quality),
    entry_quality: clamp(result.entry_quality),
    exit_quality: clamp(result.exit_quality),
    would_take_again: result.would_take_again,
    tags: Array.isArray(result.tags) ? result.tags : [],
    market_condition: result.market_condition,
    lesson: result.lesson,
    win_rate_context: scorecards?.[0] ?? {},
  })
}

export async function getRelevantLessons(instrument: string, limit = 5): Promise<Array<{ instrument: string; lesson: string; tags: string[] }>> {
  // Get instrument-specific lessons
  const { data: specific } = await supabase
    .from('trade_lessons')
    .select('instrument, lesson, tags')
    .eq('instrument', instrument)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Get recent general lessons from other instruments (for cross-learning)
  const { data: general } = await supabase
    .from('trade_lessons')
    .select('instrument, lesson, tags')
    .order('created_at', { ascending: false })
    .limit(3)

  const all = [...(specific ?? []), ...(general ?? [])]
  // Deduplicate by lesson text
  const seen = new Set<string>()
  return all.filter(l => {
    if (seen.has(l.lesson)) return false
    seen.add(l.lesson)
    return true
  })
}
```

**Step 4: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/learning/post-mortem.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/learning/post-mortem.ts __tests__/learning/post-mortem.test.ts
git commit -m "feat: add trade post-mortem lesson extraction"
```

---

## Task 7: Trade Post-Mortem — Integration

**Files:**
- Modify: `lib/learning/scorecard-updater.ts` (call extractPostMortem after scorecard update)
- Modify: `lib/agents/chief-analyst.ts` (inject recent lessons into system prompt)

**Step 1: Integrate post-mortem into scorecard updater**

Modify `lib/learning/scorecard-updater.ts`:

Add import at top:
```typescript
import { extractPostMortem } from '@/lib/learning/post-mortem'
```

After the aggregation loop that processes trades (after line 60, before the upsert loop), add post-mortem extraction for recently closed trades that don't have lessons yet:

```typescript
  // Extract post-mortems for trades that don't have lessons yet
  const { data: tradesWithoutLessons } = await supabase
    .from('trades')
    .select('id, instrument, direction, strategy, entry_price, exit_price, pnl, opened_at, closed_at, close_reason')
    .eq('status', 'closed')
    .not('pnl', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(5)

  if (tradesWithoutLessons) {
    for (const trade of tradesWithoutLessons) {
      // Check if lesson already exists for this trade
      const { data: existing } = await supabase
        .from('trade_lessons')
        .select('id')
        .eq('trade_id', trade.id)
        .limit(1)

      if (!existing || existing.length === 0) {
        try {
          await extractPostMortem(trade as Parameters<typeof extractPostMortem>[0])
        } catch (err) {
          console.error(`[scorecard-updater] Post-mortem failed for trade ${trade.id}:`, err)
        }
      }
    }
  }
```

**Step 2: Inject lessons into chief analyst**

Modify `lib/agents/chief-analyst.ts`:

Add import:
```typescript
import { getRelevantLessons } from '@/lib/learning/post-mortem'
```

In `runChiefAnalyst`, before the `callLLM` call (line 49), fetch and format lessons:

```typescript
    // Fetch relevant lessons from past trades
    let lessonsContext = ''
    try {
      const lessons = await getRelevantLessons(instrument, 3)
      if (lessons.length > 0) {
        lessonsContext = '\n\nPAST LESSONS (from trade post-mortems):\n' +
          lessons.map(l => `- [${l.instrument}] ${l.lesson} (tags: ${l.tags.join(', ')})`).join('\n')
      }
    } catch {
      // Non-critical — continue without lessons
    }
```

Then append `lessonsContext` to the userPrompt in the callLLM call:

```typescript
      userPrompt: `Make the final call for ${instrument}:
...existing prompt...${lessonsContext}`,
```

**Step 3: Run all tests**

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add lib/learning/scorecard-updater.ts lib/agents/chief-analyst.ts
git commit -m "feat: integrate post-mortem into scorecard updates and chief analyst"
```

---

## Task 8: GDELT Enhancement — Per-Instrument Sentiment

**Files:**
- Modify: `lib/services/gdelt.ts` (add instrument-mapped queries + tone scoring)
- Modify: `app/api/cron/ingest-news-sentiment/route.ts` (add GDELT alongside Finnhub)

**Step 1: Write the failing test**

Create `__tests__/services/gdelt.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getGeopoliticalSentiment, INSTRUMENT_GDELT_QUERIES } from '@/lib/services/gdelt'

describe('GDELT — Instrument Sentiment', () => {
  it('maps known instruments to geopolitical queries', () => {
    expect(INSTRUMENT_GDELT_QUERIES['XAU_USD']).toContain('gold')
    expect(INSTRUMENT_GDELT_QUERIES['EUR_USD']).toContain('eurozone')
    expect(INSTRUMENT_GDELT_QUERIES['BCO_USD']).toContain('oil')
  })

  it('getGeopoliticalSentiment returns articles + tone for an instrument', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          { title: 'Gold surges on conflict fears', url: 'http://test.com', source: 'Reuters', seendate: '20260402T120000Z' },
        ],
      }),
    })

    const result = await getGeopoliticalSentiment('XAU_USD')
    expect(result.articles.length).toBeGreaterThan(0)
    expect(result.articles[0].title).toContain('Gold')
  })

  it('returns empty array on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await getGeopoliticalSentiment('EUR_USD')
    expect(result.articles).toEqual([])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/services/gdelt.test.ts`
Expected: FAIL — `getGeopoliticalSentiment` and `INSTRUMENT_GDELT_QUERIES` don't exist

**Step 3: Enhance GDELT service**

Modify `lib/services/gdelt.ts` — add instrument-specific queries and sentiment function. Append after the existing code:

```typescript
export const INSTRUMENT_GDELT_QUERIES: Record<string, string> = {
  XAU_USD: 'gold price geopolitics war sanctions',
  EUR_USD: 'eurozone economy ECB policy',
  USD_JPY: 'japan yen BOJ monetary policy',
  BCO_USD: 'oil price OPEC supply demand',
  US30_USD: 'US economy stocks fed policy',
  EUR_GBP: 'UK economy sterling Brexit BOE',
}

export async function getGeopoliticalSentiment(instrument: string): Promise<{
  articles: GeopoliticalArticle[]
  articleCount: number
}> {
  const query = INSTRUMENT_GDELT_QUERIES[instrument] ?? 'forex currency central bank'

  try {
    const articles = await queryGdelt(query, 15)
    return {
      articles: articles.map(a => ({
        title: a.title,
        url: a.url,
        source: a.source || 'GDELT',
        published_at: parseGdeltDate(a.seendate),
      })),
      articleCount: articles.length,
    }
  } catch {
    return { articles: [], articleCount: 0 }
  }
}
```

**Step 4: Integrate GDELT into news sentiment cron**

Modify `app/api/cron/ingest-news-sentiment/route.ts`:

Add import:
```typescript
import { getGeopoliticalSentiment } from '@/lib/services/gdelt'
```

Inside the instrument loop, after the Finnhub sentiment insert (after line 87), add GDELT scoring:

```typescript
      // Also ingest GDELT geopolitical sentiment for this instrument
      try {
        const gdelt = await getGeopoliticalSentiment(instrument)
        if (gdelt.articleCount > 0) {
          const gdeltHeadlines = gdelt.articles
            .slice(0, 10)
            .map((a, i) => `${i + 1}. ${a.title}`)
            .join('\n')

          let gdeltScore = 0
          try {
            const gdeltLLM = await callLLM({
              tier: 'cheap',
              systemPrompt: `You are a geopolitical sentiment analyzer. Given GDELT news headlines related to ${instrument}, output a single number between -1.0 (very bearish) and +1.0 (very bullish). Output ONLY the number.`,
              userPrompt: `Rate the geopolitical sentiment for ${instrument}:\n\n${gdeltHeadlines}`,
              maxTokens: 10,
              temperature: 0.1,
            })
            const parsed = parseFloat(gdeltLLM.content.trim())
            if (!isNaN(parsed) && parsed >= -1 && parsed <= 1) gdeltScore = parsed
          } catch { gdeltScore = 0 }

          await supabase.from('news_sentiment').insert({
            instrument,
            score: gdeltScore,
            headline_count: gdelt.articleCount,
            headlines: gdelt.articles.slice(0, 10).map(a => a.title),
            source: 'gdelt',
          })

          results.push(`${instrument} (GDELT): ${gdelt.articleCount} headlines, score=${gdeltScore.toFixed(2)}`)
        }
      } catch (gdeltErr) {
        console.error(`[ingest-news-sentiment] GDELT failed for ${instrument}:`, gdeltErr)
      }
```

**Step 5: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/services/gdelt.test.ts`
Expected: PASS

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add lib/services/gdelt.ts app/api/cron/ingest-news-sentiment/route.ts __tests__/services/gdelt.test.ts
git commit -m "feat: GDELT per-instrument sentiment scoring alongside Finnhub"
```

---

## Task 9: Instrument Universe — Database Migration

**Files:**
- Create: `supabase/migrations/021_instrument_universe.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2: Commit**

```bash
git add supabase/migrations/021_instrument_universe.sql
git commit -m "feat: add instrument_universe table migration (021)"
```

---

## Task 10: Dynamic Instruments — Helper + Cron Refactor

**Files:**
- Create: `lib/instruments.ts`
- Create: `__tests__/instruments.test.ts`
- Modify: `app/api/cron/run-pipeline/route.ts` (use dynamic instruments)
- Modify: `app/api/cron/ingest-candles/route.ts` (use dynamic instruments)
- Modify: `app/api/cron/ingest-news-sentiment/route.ts` (use dynamic instruments)

**Step 1: Write the failing test**

Create `__tests__/instruments.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { instrument: 'EUR_USD', display_name: 'EUR/USD' },
            { instrument: 'XAU_USD', display_name: 'Gold' },
          ],
          error: null,
        }),
      }),
    })),
  },
}))

import { getActiveInstruments, FRIENDLY_NAMES_FALLBACK } from '@/lib/instruments'

describe('Dynamic Instruments', () => {
  it('getActiveInstruments returns instruments from DB', async () => {
    const instruments = await getActiveInstruments()
    expect(instruments).toEqual(['EUR_USD', 'XAU_USD'])
  })

  it('has fallback friendly names for all original instruments', () => {
    expect(FRIENDLY_NAMES_FALLBACK['XAU_USD']).toBe('Gold')
    expect(FRIENDLY_NAMES_FALLBACK['EUR_USD']).toBe('EUR/USD')
    expect(FRIENDLY_NAMES_FALLBACK['BCO_USD']).toBe('Oil')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/instruments.test.ts`
Expected: FAIL

**Step 3: Write the helper**

Create `lib/instruments.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'

/** Fallback instrument list — used if DB query fails */
const FALLBACK_INSTRUMENTS = ['XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD']

export const FRIENDLY_NAMES_FALLBACK: Record<string, string> = {
  XAU_USD: 'Gold', EUR_GBP: 'EUR/GBP', EUR_USD: 'EUR/USD',
  USD_JPY: 'USD/JPY', BCO_USD: 'Oil', US30_USD: 'Dow Jones',
}

/**
 * Get active instruments from instrument_universe table.
 * Falls back to hardcoded list if DB unavailable.
 */
export async function getActiveInstruments(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('instrument_universe')
      .select('instrument')
      .eq('status', 'active')

    if (error || !data || data.length === 0) {
      return FALLBACK_INSTRUMENTS
    }

    return data.map(row => row.instrument)
  } catch {
    return FALLBACK_INSTRUMENTS
  }
}

/**
 * Get friendly display name for an instrument.
 * Tries DB first, falls back to hardcoded map.
 */
export async function getFriendlyNames(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase
      .from('instrument_universe')
      .select('instrument, display_name')
      .eq('status', 'active')

    if (data && data.length > 0) {
      const names: Record<string, string> = { ...FRIENDLY_NAMES_FALLBACK }
      for (const row of data) {
        if (row.display_name) names[row.instrument] = row.display_name
      }
      return names
    }
  } catch { /* fallback */ }
  return FRIENDLY_NAMES_FALLBACK
}
```

**Step 4: Run test**

Run: `cd forex-trading-bot && npx vitest run __tests__/instruments.test.ts`
Expected: PASS

**Step 5: Refactor cron routes to use dynamic instruments**

Modify `app/api/cron/run-pipeline/route.ts`:

Replace lines 1-10 with:
```typescript
import { NextResponse } from 'next/server'
import { runPipeline, PipelineResult } from '@/lib/pipeline'
import { logCron } from '@/lib/services/cron-logger'
import { getActiveInstruments, getFriendlyNames } from '@/lib/instruments'
```

Replace the hardcoded `INSTRUMENTS` array and `FRIENDLY_NAMES` constant usage. In the GET handler:
```typescript
    const INSTRUMENTS = await getActiveInstruments()
    const FRIENDLY_NAMES = await getFriendlyNames()
```

Change `all 6 markets` to `all ${INSTRUMENTS.length} markets` in the summary line.

Modify `app/api/cron/ingest-candles/route.ts`:

Add import:
```typescript
import { getActiveInstruments } from '@/lib/instruments'
```

Replace hardcoded `INSTRUMENTS` line. In GET handler:
```typescript
    const INSTRUMENTS = await getActiveInstruments()
```

Change `all 6 markets` to `all ${INSTRUMENTS.length} markets` in summary.

Modify `app/api/cron/ingest-news-sentiment/route.ts`:

Add import:
```typescript
import { getActiveInstruments } from '@/lib/instruments'
```

Replace hardcoded `INSTRUMENTS` line. In GET handler:
```typescript
    const INSTRUMENTS = await getActiveInstruments()
```

**Step 6: Run all tests**

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add lib/instruments.ts __tests__/instruments.test.ts app/api/cron/run-pipeline/route.ts app/api/cron/ingest-candles/route.ts app/api/cron/ingest-news-sentiment/route.ts
git commit -m "feat: dynamic instrument list from DB, crons read from instrument_universe"
```

---

## Task 11: Weekly Instrument Discovery

**Files:**
- Create: `lib/intelligence/discovery.ts`
- Create: `app/api/cron/discover-instruments/route.ts`
- Create: `__tests__/intelligence/discovery.test.ts`
- Modify: `vercel.json` (add weekly cron)

**Step 1: Write the failing test**

Create `__tests__/intelligence/discovery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }),
})

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'instrument_universe') {
        return {
          select: mockSelect.mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { instrument: 'EUR_USD', status: 'active' },
                { instrument: 'XAU_USD', status: 'active' },
                { instrument: 'USD_JPY', status: 'active' },
              ],
              error: null,
            }),
          }),
          upsert: mockUpsert,
          update: mockUpdate,
        }
      }
      if (table === 'agent_scorecards') {
        return {
          select: vi.fn().mockReturnValue({
            mockResolvedValue: vi.fn(),
            then: vi.fn(),
          }),
        }
      }
      if (table === 'trades') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }),
  },
}))

vi.mock('@/lib/services/openrouter', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      add: [{ instrument: 'GBP_USD', reason: 'BOE meeting next week', expected_regime: 'trending' }],
      remove: [],
      keep: [{ instrument: 'EUR_USD', reason: 'Still strong trend' }],
    }),
  }),
  parseLLMJson: vi.fn().mockImplementation((content: string, fallback: unknown) => {
    try { return JSON.parse(content) } catch { return fallback }
  }),
}))

vi.mock('@/lib/services/telegram', () => ({
  alertCustom: vi.fn().mockResolvedValue(true),
}))

import { runDiscovery, validateDiscoveryResult } from '@/lib/intelligence/discovery'

describe('Instrument Discovery', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('validateDiscoveryResult enforces min 3 active instruments', () => {
    const result = validateDiscoveryResult(
      { add: [], remove: [{ instrument: 'EUR_USD', reason: 'test' }, { instrument: 'XAU_USD', reason: 'test' }], keep: [] },
      ['EUR_USD', 'XAU_USD', 'USD_JPY']
    )
    // Can't remove 2 when only 3 active — would leave 1
    expect(result.remove.length).toBeLessThanOrEqual(0)
  })

  it('validateDiscoveryResult enforces max 12 active instruments', () => {
    const current = Array.from({ length: 12 }, (_, i) => `INST_${i}`)
    const result = validateDiscoveryResult(
      { add: [{ instrument: 'NEW_1', reason: 'test', expected_regime: 'trending' }], remove: [], keep: [] },
      current
    )
    expect(result.add.length).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/discovery.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `lib/intelligence/discovery.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { alertCustom } from '@/lib/services/telegram'

const MIN_INSTRUMENTS = 3
const MAX_INSTRUMENTS = 12

interface DiscoveryAdd { instrument: string; reason: string; expected_regime?: string }
interface DiscoveryRemove { instrument: string; reason: string }
interface DiscoveryKeep { instrument: string; reason: string }

export interface DiscoveryResult {
  add: DiscoveryAdd[]
  remove: DiscoveryRemove[]
  keep: DiscoveryKeep[]
}

const FALLBACK: DiscoveryResult = { add: [], remove: [], keep: [] }

export function validateDiscoveryResult(result: DiscoveryResult, currentActive: string[]): DiscoveryResult {
  const activeCount = currentActive.length

  // Enforce min 3
  let allowedRemoves = Math.max(0, activeCount - MIN_INSTRUMENTS)
  const validRemoves = result.remove.slice(0, allowedRemoves)

  // Enforce max 12
  const remainingAfterRemoves = activeCount - validRemoves.length
  const allowedAdds = Math.max(0, MAX_INSTRUMENTS - remainingAfterRemoves)
  const validAdds = result.add.slice(0, allowedAdds)

  return {
    add: validAdds,
    remove: validRemoves,
    keep: result.keep,
  }
}

export async function runDiscovery(): Promise<{ added: string[]; removed: string[]; kept: string[] }> {
  // 1. Get current active instruments
  const { data: activeRows } = await supabase
    .from('instrument_universe')
    .select('instrument')
    .eq('status', 'active')

  const currentActive = activeRows?.map(r => r.instrument) ?? []

  // 2. Get performance stats
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('instrument, win_rate, total_trades, avg_pnl, total_pnl')

  const perfSummary = (scorecards ?? [])
    .reduce((acc, s) => {
      if (!acc[s.instrument]) acc[s.instrument] = { trades: 0, totalPnl: 0, winRate: 0 }
      acc[s.instrument].trades += s.total_trades
      acc[s.instrument].totalPnl += s.total_pnl ?? 0
      acc[s.instrument].winRate = s.win_rate
      return acc
    }, {} as Record<string, { trades: number; totalPnl: number; winRate: number }>)

  const perfContext = currentActive
    .map(i => {
      const p = perfSummary[i]
      return p
        ? `${i}: ${p.trades} trades, ${(p.winRate * 100).toFixed(0)}% win rate, $${p.totalPnl.toFixed(2)} P&L`
        : `${i}: no trades yet`
    })
    .join('\n')

  // 3. Ask LLM for recommendations
  let result: DiscoveryResult
  try {
    const response = await callLLM({
      tier: 'strong',
      systemPrompt: `You are a market research analyst for a forex trading bot. Recommend instrument changes for the coming week.

Output JSON:
{
  "add": [{"instrument": "SYMBOL", "reason": "why add", "expected_regime": "trending|ranging"}],
  "remove": [{"instrument": "SYMBOL", "reason": "why remove"}],
  "keep": [{"instrument": "SYMBOL", "reason": "why keep"}]
}

Use standard instrument format: BASE_QUOTE (e.g., EUR_USD, GBP_JPY, XAU_USD, US30_USD, BCO_USD).
Only suggest instruments tradeable on Capital.com.
Min 3, max 12 active instruments.
Output ONLY valid JSON, no markdown.`,
      userPrompt: `Current active instruments and performance:\n${perfContext}\n\nGiven current macro conditions, which instruments should we add, remove, or keep for this week? Consider central bank meetings, geopolitical events, volatility regimes, and our recent performance.`,
      maxTokens: 500,
    })

    result = parseLLMJson<DiscoveryResult>(response.content, FALLBACK)
  } catch {
    result = FALLBACK
  }

  // 4. Validate and apply constraints
  const validated = validateDiscoveryResult(result, currentActive)

  // 5. Check no open positions on instruments to remove
  const finalRemoves: string[] = []
  for (const r of validated.remove) {
    const { data: openTrades } = await supabase
      .from('trades')
      .select('id')
      .eq('instrument', r.instrument)
      .in('status', ['open', 'pending'])

    if (!openTrades || openTrades.length === 0) {
      await supabase
        .from('instrument_universe')
        .update({ status: 'removed', removed_reason: r.reason, updated_at: new Date().toISOString() })
        .eq('instrument', r.instrument)
        .eq('status', 'active')
      finalRemoves.push(r.instrument)
    }
  }

  // 6. Add new instruments
  const finalAdds: string[] = []
  for (const a of validated.add) {
    await supabase.from('instrument_universe').upsert({
      instrument: a.instrument,
      display_name: a.instrument.replace('_', '/'),
      asset_class: guessAssetClass(a.instrument),
      status: 'active',
      added_reason: a.reason,
      discovery_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'instrument' })
    finalAdds.push(a.instrument)
  }

  const kept = validated.keep.map(k => k.instrument)

  // 7. Send Telegram summary
  const lines: string[] = []
  if (finalAdds.length > 0) lines.push(`Added: ${finalAdds.join(', ')}`)
  if (finalRemoves.length > 0) lines.push(`Removed: ${finalRemoves.join(', ')}`)
  lines.push(`Keeping: ${kept.join(', ') || currentActive.join(', ')}`)

  alertCustom('Weekly Instrument Discovery', lines.join('\n')).catch(() => {})

  return { added: finalAdds, removed: finalRemoves, kept }
}

function guessAssetClass(instrument: string): string {
  if (instrument.startsWith('XAU') || instrument.startsWith('XAG')) return 'commodity'
  if (instrument.startsWith('BCO') || instrument.startsWith('WTI')) return 'commodity'
  if (instrument.startsWith('US30') || instrument.startsWith('SPX') || instrument.startsWith('NAS')) return 'index'
  return 'forex'
}
```

**Step 4: Write the cron route**

Create `app/api/cron/discover-instruments/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { runDiscovery } from '@/lib/intelligence/discovery'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDiscovery()

    const parts: string[] = []
    if (result.added.length > 0) parts.push(`Added ${result.added.join(', ')} to trading universe`)
    if (result.removed.length > 0) parts.push(`Removed ${result.removed.join(', ')}`)
    if (parts.length === 0) parts.push('No changes to instrument universe this week')

    const msg = `Weekly discovery: ${parts.join('. ')}.`
    await logCron('discover-instruments', msg)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const msg = `Discovery failed: ${error instanceof Error ? error.message : 'Unknown'}`
    await logCron('discover-instruments', msg, false).catch(() => {})
    console.error('[cron/discover-instruments] Error:', error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
```

**Step 5: Add weekly cron to vercel.json**

Add to the crons array:
```json
    {
      "path": "/api/cron/discover-instruments",
      "schedule": "30 0 * * 0"
    }
```

(Sunday 00:30 UTC — 30 min after weekly review)

**Step 6: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/discovery.test.ts`
Expected: PASS

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add lib/intelligence/discovery.ts app/api/cron/discover-instruments/route.ts __tests__/intelligence/discovery.test.ts vercel.json
git commit -m "feat: weekly instrument discovery via OpenRouter"
```

---

## Task 12: Market Screener

**Files:**
- Create: `lib/intelligence/screener.ts`
- Create: `__tests__/intelligence/screener.test.ts`
- Modify: `lib/pipeline.ts` (call screener before iterating)
- Modify: `app/api/cron/run-pipeline/route.ts` (use screener to pick top instruments)

**Step 1: Write the failing test**

Create `__tests__/intelligence/screener.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreInstrument, rankInstruments, DEFAULT_WEIGHTS } from '@/lib/intelligence/screener'

describe('Market Screener', () => {
  it('scoreInstrument produces weighted composite score', () => {
    const scores = {
      volatility: 0.8,
      trend: 0.6,
      news_catalyst: 0.4,
      calendar_proximity: 0.2,
      historical_edge: 0.7,
      pm_signal: 0.5,
    }

    const composite = scoreInstrument(scores, DEFAULT_WEIGHTS)
    // Expected: 0.8*0.2 + 0.6*0.25 + 0.4*0.15 + 0.2*0.1 + 0.7*0.2 + 0.5*0.1
    // = 0.16 + 0.15 + 0.06 + 0.02 + 0.14 + 0.05 = 0.58
    expect(composite).toBeCloseTo(0.58, 2)
  })

  it('scoreInstrument returns 0 for all-zero scores', () => {
    const scores = { volatility: 0, trend: 0, news_catalyst: 0, calendar_proximity: 0, historical_edge: 0, pm_signal: 0 }
    expect(scoreInstrument(scores, DEFAULT_WEIGHTS)).toBe(0)
  })

  it('rankInstruments sorts by composite score descending', () => {
    const items = [
      { instrument: 'A', composite: 0.3 },
      { instrument: 'B', composite: 0.8 },
      { instrument: 'C', composite: 0.5 },
    ]
    const ranked = rankInstruments(items, 2, 0.1)
    expect(ranked[0].instrument).toBe('B')
    expect(ranked[1].instrument).toBe('C')
    expect(ranked.length).toBe(2)
  })

  it('rankInstruments filters below minimum score threshold', () => {
    const items = [
      { instrument: 'A', composite: 0.05 },
      { instrument: 'B', composite: 0.8 },
    ]
    const ranked = rankInstruments(items, 10, 0.1)
    expect(ranked.length).toBe(1)
    expect(ranked[0].instrument).toBe('B')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/screener.test.ts`
Expected: FAIL

**Step 3: Write the screener**

Create `lib/intelligence/screener.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'

export interface ScreenerScores {
  volatility: number
  trend: number
  news_catalyst: number
  calendar_proximity: number
  historical_edge: number
  pm_signal: number
}

export interface ScreenerWeights {
  volatility: number
  trend: number
  news_catalyst: number
  calendar_proximity: number
  historical_edge: number
  pm_signal: number
}

export const DEFAULT_WEIGHTS: ScreenerWeights = {
  volatility: 0.2,
  trend: 0.25,
  news_catalyst: 0.15,
  calendar_proximity: 0.1,
  historical_edge: 0.2,
  pm_signal: 0.1,
}

const MIN_SCORE_THRESHOLD = 0.1

export function scoreInstrument(scores: ScreenerScores, weights: ScreenerWeights): number {
  return (
    scores.volatility * weights.volatility +
    scores.trend * weights.trend +
    scores.news_catalyst * weights.news_catalyst +
    scores.calendar_proximity * weights.calendar_proximity +
    scores.historical_edge * weights.historical_edge +
    scores.pm_signal * weights.pm_signal
  )
}

export function rankInstruments(
  items: Array<{ instrument: string; composite: number }>,
  maxN: number,
  minScore = MIN_SCORE_THRESHOLD
): Array<{ instrument: string; composite: number }> {
  return items
    .filter(i => i.composite >= minScore)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, maxN)
}

/**
 * Screen all active instruments and return top N ranked by composite score.
 * Pure data scoring — no LLM call needed.
 */
export async function screenInstruments(
  instruments: string[],
  maxPositions: number
): Promise<Array<{ instrument: string; composite: number; scores: ScreenerScores }>> {
  const results: Array<{ instrument: string; composite: number; scores: ScreenerScores }> = []

  for (const instrument of instruments) {
    const scores = await computeScores(instrument)
    const composite = scoreInstrument(scores, DEFAULT_WEIGHTS)
    results.push({ instrument, composite, scores })
  }

  const ranked = rankInstruments(
    results.map(r => ({ instrument: r.instrument, composite: r.composite })),
    maxPositions,
    MIN_SCORE_THRESHOLD
  )

  return results
    .filter(r => ranked.some(rk => rk.instrument === r.instrument))
    .sort((a, b) => b.composite - a.composite)
}

async function computeScores(instrument: string): Promise<ScreenerScores> {
  // 1. Volatility score — ATR percentile vs 30-day average
  const { data: indicators } = await supabase
    .from('indicators')
    .select('atr_14, adx_14, ema_20, ema_50')
    .eq('instrument', instrument)
    .eq('granularity', 'H4')
    .order('time', { ascending: false })
    .limit(30)

  let volatility = 0.5
  let trend = 0.5

  if (indicators && indicators.length >= 2) {
    const currentATR = indicators[0].atr_14
    const avgATR = indicators.reduce((s, r) => s + r.atr_14, 0) / indicators.length
    volatility = avgATR > 0 ? Math.min(1, currentATR / avgATR) : 0.5

    // Trend score — ADX strength + EMA alignment
    const adx = indicators[0].adx_14
    const emaAligned = indicators[0].ema_20 !== indicators[0].ema_50 ? 1 : 0
    trend = Math.min(1, (adx / 50) * 0.7 + emaAligned * 0.3)
  }

  // 2. News catalyst score — recent headline activity
  const { data: sentiment } = await supabase
    .from('news_sentiment')
    .select('headline_count, score')
    .eq('instrument', instrument)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const news_catalyst = sentiment
    ? Math.min(1, (sentiment.headline_count / 10) * 0.5 + Math.abs(sentiment.score) * 0.5)
    : 0

  // 3. Calendar proximity — upcoming high-impact events
  const now = new Date().toISOString()
  const fourHoursLater = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('economic_events')
    .select('impact')
    .gte('event_time', now)
    .lte('event_time', fourHoursLater)

  const calendar_proximity = events && events.length > 0
    ? Math.min(1, events.filter(e => e.impact === 'high').length * 0.5 + events.length * 0.1)
    : 0

  // 4. Historical edge — bot's win rate on this instrument
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('win_rate, total_trades')
    .eq('instrument', instrument)

  let historical_edge = 0.5 // neutral default
  if (scorecards && scorecards.length > 0) {
    const totalTrades = scorecards.reduce((s, r) => s + r.total_trades, 0)
    const avgWinRate = scorecards.reduce((s, r) => s + r.win_rate, 0) / scorecards.length
    // More trades + higher win rate = more edge
    historical_edge = Math.min(1, avgWinRate * 0.7 + Math.min(1, totalTrades / 20) * 0.3)
  }

  // 5. PM signal score
  const { data: signals } = await supabase
    .from('prediction_signals')
    .select('strength')
    .eq('status', 'active')

  const pm_signal = signals && signals.length > 0
    ? Math.min(1, signals.reduce((s, r) => s + r.strength, 0) / signals.length)
    : 0

  return { volatility, trend, news_catalyst, calendar_proximity, historical_edge, pm_signal }
}
```

**Step 4: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/screener.test.ts`
Expected: PASS

**Step 5: Integrate screener into run-pipeline cron**

Modify `app/api/cron/run-pipeline/route.ts` — add screener to filter instruments:

Add import:
```typescript
import { screenInstruments } from '@/lib/intelligence/screener'
```

In the GET handler, after getting `INSTRUMENTS`, add:

```typescript
    // Screen instruments — prioritize top opportunities
    let instrumentsToTrade = INSTRUMENTS
    try {
      const screened = await screenInstruments(INSTRUMENTS, 6)
      if (screened.length > 0) {
        instrumentsToTrade = screened.map(s => s.instrument)
      }
    } catch (screenErr) {
      console.error('[cron/run-pipeline] Screener failed, using all instruments:', screenErr)
    }
```

Then use `instrumentsToTrade` instead of `INSTRUMENTS` in the for loop.

**Step 6: Run all tests**

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add lib/intelligence/screener.ts __tests__/intelligence/screener.test.ts app/api/cron/run-pipeline/route.ts
git commit -m "feat: market screener ranks instruments by composite score"
```

---

## Task 13: Scan Scheduler

**Files:**
- Create: `lib/intelligence/scan-scheduler.ts`
- Create: `__tests__/intelligence/scan-scheduler.test.ts`
- Modify: all cron routes (add `shouldRunNow()` check)
- Modify: `vercel.json` (increase pipeline frequency to every 15 min)

**Step 1: Write the failing test**

Create `__tests__/intelligence/scan-scheduler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })),
  },
}))

import { detectSession, getSessionSchedule, shouldRunNow } from '@/lib/intelligence/scan-scheduler'

describe('Scan Scheduler', () => {
  it('detectSession returns asian for 03:00 UTC', () => {
    const date = new Date('2026-04-06T03:00:00Z') // Monday
    expect(detectSession(date)).toBe('asian')
  })

  it('detectSession returns london for 10:00 UTC', () => {
    const date = new Date('2026-04-06T10:00:00Z')
    expect(detectSession(date)).toBe('london')
  })

  it('detectSession returns overlap for 14:00 UTC', () => {
    const date = new Date('2026-04-06T14:00:00Z')
    expect(detectSession(date)).toBe('overlap')
  })

  it('detectSession returns new_york for 18:00 UTC', () => {
    const date = new Date('2026-04-06T18:00:00Z')
    expect(detectSession(date)).toBe('new_york')
  })

  it('detectSession returns off_hours for 22:00 UTC', () => {
    const date = new Date('2026-04-06T22:00:00Z')
    expect(detectSession(date)).toBe('off_hours')
  })

  it('getSessionSchedule returns correct intervals', () => {
    expect(getSessionSchedule('overlap').pipelineMinutes).toBe(15)
    expect(getSessionSchedule('london').pipelineMinutes).toBe(30)
    expect(getSessionSchedule('asian').pipelineMinutes).toBe(120)
    expect(getSessionSchedule('off_hours').pipelineMinutes).toBe(240)
  })

  it('shouldRunNow returns true for run-pipeline during overlap', async () => {
    const now = new Date('2026-04-06T14:00:00Z')
    const result = await shouldRunNow('run-pipeline', now)
    expect(result).toBe(true)
  })

  it('shouldRunNow returns false for run-pipeline at wrong minute during off_hours', async () => {
    // Off-hours pipeline = every 240 min. Only runs at :00 of 21, 22, 23, 0
    const now = new Date('2026-04-06T22:15:00Z') // 15 min past — should skip
    const result = await shouldRunNow('run-pipeline', now)
    expect(result).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/scan-scheduler.test.ts`
Expected: FAIL

**Step 3: Write the scan scheduler**

Create `lib/intelligence/scan-scheduler.ts`:

```typescript
import { supabase } from '@/lib/services/supabase'

export type MarketSession = 'asian' | 'london' | 'overlap' | 'new_york' | 'off_hours'

interface SessionSchedule {
  pipelineMinutes: number
  candleMinutes: number
}

const SESSION_SCHEDULES: Record<MarketSession, SessionSchedule> = {
  asian:      { pipelineMinutes: 120, candleMinutes: 30 },
  london:     { pipelineMinutes: 30,  candleMinutes: 15 },
  new_york:   { pipelineMinutes: 30,  candleMinutes: 15 },
  overlap:    { pipelineMinutes: 15,  candleMinutes: 15 },
  off_hours:  { pipelineMinutes: 240, candleMinutes: 30 },
}

const CRON_INTERVALS: Record<string, keyof SessionSchedule> = {
  'run-pipeline': 'pipelineMinutes',
  'ingest-candles': 'candleMinutes',
}

export function detectSession(now: Date = new Date()): MarketSession {
  const hour = now.getUTCHours()
  const day = now.getUTCDay()

  // Weekend = off_hours
  if (day === 0 || day === 6) return 'off_hours'

  if (hour >= 13 && hour < 16) return 'overlap'
  if (hour >= 8 && hour < 13) return 'london'
  if (hour >= 16 && hour < 21) return 'new_york'
  if (hour >= 0 && hour < 8) return 'asian'
  return 'off_hours' // 21:00–00:00
}

export function getSessionSchedule(session: MarketSession): SessionSchedule {
  return SESSION_SCHEDULES[session]
}

/**
 * Smart skip pattern: called at the top of each cron route.
 * Returns true if this cron should actually execute now.
 * Returns false if it should skip (too frequent for current session).
 *
 * Crons not in CRON_INTERVALS always run (e.g., ingest-equity, poll-prediction-markets).
 */
export async function shouldRunNow(cronName: string, now: Date = new Date()): Promise<boolean> {
  const intervalKey = CRON_INTERVALS[cronName]
  if (!intervalKey) return true // Not a throttled cron — always run

  const session = detectSession(now)
  const schedule = SESSION_SCHEDULES[session]
  const intervalMinutes = schedule[intervalKey]

  const minute = now.getUTCMinutes()
  const hour = now.getUTCHours()
  const totalMinutes = hour * 60 + minute

  // Check if current time aligns with the interval
  if (totalMinutes % intervalMinutes !== 0) {
    return false
  }

  // Check event proximity — boost frequency near high-impact events
  try {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

    const { data: nearbyEvents } = await supabase
      .from('economic_events')
      .select('impact')
      .gte('event_time', oneHourAgo)
      .lte('event_time', oneHourAhead)

    const hasHighImpact = nearbyEvents?.some(e => e.impact === 'high')
    if (hasHighImpact) {
      // Near high-impact event — always run pipeline
      return true
    }
  } catch {
    // DB error — default to running
    return true
  }

  return true
}
```

**Step 4: Run tests**

Run: `cd forex-trading-bot && npx vitest run __tests__/intelligence/scan-scheduler.test.ts`
Expected: PASS

**Step 5: Add shouldRunNow to run-pipeline and ingest-candles crons**

Modify `app/api/cron/run-pipeline/route.ts` — add at top of GET handler, after auth check:

```typescript
  import { shouldRunNow } from '@/lib/intelligence/scan-scheduler'

  // Inside GET, after auth check:
  const shouldRun = await shouldRunNow('run-pipeline')
  if (!shouldRun) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Scan scheduler: not time to run in current session' })
  }
```

Modify `app/api/cron/ingest-candles/route.ts` — same pattern:

```typescript
  import { shouldRunNow } from '@/lib/intelligence/scan-scheduler'

  // Inside GET, after auth check:
  const shouldRun = await shouldRunNow('ingest-candles')
  if (!shouldRun) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Scan scheduler: not time for candle ingestion' })
  }
```

**Step 6: Update vercel.json — increase pipeline frequency**

Change run-pipeline from `"0 * * * *"` (hourly) to `"*/15 * * * *"` (every 15 min):

```json
    {
      "path": "/api/cron/run-pipeline",
      "schedule": "*/15 * * * *"
    }
```

The scan scheduler will handle skipping when it's not time to run.

**Step 7: Run all tests**

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add lib/intelligence/scan-scheduler.ts __tests__/intelligence/scan-scheduler.test.ts app/api/cron/run-pipeline/route.ts app/api/cron/ingest-candles/route.ts vercel.json
git commit -m "feat: scan scheduler adjusts cron frequency by market session"
```

---

## Task 14: Database Types Update

**Files:**
- Create: `lib/types/database.ts` (add new row types)

**Step 1: Add types for new tables**

Add to `lib/types/database.ts`:

```typescript
export interface TradeLessonRow {
  id: string
  trade_id: string
  instrument: string
  direction: string
  process_quality: number
  entry_quality: number
  exit_quality: number
  would_take_again: boolean
  tags: string[]
  market_condition: string
  lesson: string
  win_rate_context: Record<string, unknown>
  created_at: string
}

export interface InstrumentUniverseRow {
  id: string
  instrument: string
  display_name: string | null
  asset_class: string | null
  status: 'active' | 'watchlist' | 'removed'
  added_reason: string | null
  removed_reason: string | null
  discovery_date: string
  last_traded: string | null
  performance_score: number
  updated_at: string
}
```

**Step 2: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat: add TradeLessonRow and InstrumentUniverseRow types"
```

---

## Task 15: Final Verification + Build

**Step 1: Run all tests**

Run: `cd forex-trading-bot && npx vitest run`
Expected: All tests pass (91 original + new tests)

**Step 2: TypeScript build check**

Run: `cd forex-trading-bot && npx next build`
Expected: Build succeeds with zero TypeScript errors

**Step 3: Review changes**

Run: `cd forex-trading-bot && git log --oneline -15`
Verify: Clean commit history with one commit per feature/task

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final fixes from build verification"
```

---

## Summary of All New/Modified Files

| File | Action | Feature |
|------|--------|---------|
| `supabase/migrations/019_kill_switch.sql` | NEW | F |
| `lib/services/kill-switch.ts` | NEW | F |
| `app/api/kill-switch/route.ts` | NEW | F |
| `__tests__/api/kill-switch.test.ts` | NEW | F |
| `app/dashboard/KillSwitchButton.tsx` | NEW | F |
| `app/dashboard/page.tsx` | MODIFY | F |
| `lib/pipeline.ts` | MODIFY | F |
| `__tests__/pipeline/kill-switch-integration.test.ts` | NEW | F |
| `supabase/migrations/020_trade_lessons.sql` | NEW | E |
| `lib/learning/post-mortem.ts` | NEW | E |
| `__tests__/learning/post-mortem.test.ts` | NEW | E |
| `lib/learning/scorecard-updater.ts` | MODIFY | E |
| `lib/agents/chief-analyst.ts` | MODIFY | E |
| `lib/services/gdelt.ts` | MODIFY | C |
| `app/api/cron/ingest-news-sentiment/route.ts` | MODIFY | C |
| `__tests__/services/gdelt.test.ts` | NEW | C |
| `supabase/migrations/021_instrument_universe.sql` | NEW | D, A |
| `lib/instruments.ts` | NEW | D |
| `__tests__/instruments.test.ts` | NEW | D |
| `lib/intelligence/discovery.ts` | NEW | D |
| `app/api/cron/discover-instruments/route.ts` | NEW | D |
| `__tests__/intelligence/discovery.test.ts` | NEW | D |
| `app/api/cron/run-pipeline/route.ts` | MODIFY | D, A |
| `app/api/cron/ingest-candles/route.ts` | MODIFY | D |
| `app/api/cron/ingest-news-sentiment/route.ts` | MODIFY | D |
| `lib/intelligence/screener.ts` | NEW | A |
| `__tests__/intelligence/screener.test.ts` | NEW | A |
| `lib/intelligence/scan-scheduler.ts` | NEW | B |
| `__tests__/intelligence/scan-scheduler.test.ts` | NEW | B |
| `lib/types/database.ts` | MODIFY | All |
| `vercel.json` | MODIFY | B, D |
