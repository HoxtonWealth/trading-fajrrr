import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock insert tracker ────────────────────────────────────────────
const mockInsert = vi.fn().mockResolvedValue({ error: null })

// ── Supabase mock ──────────────────────────────────────────────────
// Each table needs its own chain of methods. We track calls via from()
vi.mock('@/lib/services/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'candles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    lte: vi.fn().mockReturnValue({
                      order: vi.fn().mockResolvedValue({
                        data: [
                          { time: '2026-03-01T00:00:00Z', open: 1.08, high: 1.09, low: 1.07, close: 1.085 },
                        ],
                        error: null,
                      }),
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
              eq: vi.fn().mockResolvedValue({
                data: [{ win_rate: 0.55, total_trades: 20, avg_pnl: 12.5 }],
                error: null,
              }),
            }),
          }
        }

        if (table === 'trade_lessons') {
          return {
            insert: mockInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      { instrument: 'EUR_USD', lesson: 'Trend was strong', tags: ['trend-follow'] },
                      { instrument: 'EUR_USD', lesson: 'Avoid counter-trend in high ADX', tags: ['counter-trend'] },
                    ],
                    error: null,
                  }),
                }),
              }),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { instrument: 'XAU_USD', lesson: 'Gold respects round numbers', tags: ['mean-reversion'] },
                    { instrument: 'EUR_USD', lesson: 'Trend was strong', tags: ['trend-follow'] }, // duplicate
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }

        // Fallback
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }),
    },
  }
})

// ── OpenRouter mock ────────────────────────────────────────────────
vi.mock('@/lib/services/openrouter', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      process_quality: 4,
      entry_quality: 5,
      exit_quality: 3,
      would_take_again: true,
      tags: ['trend-follow'],
      market_condition: 'Strong uptrend with pullback',
      lesson: 'Entry timing was good but exit was premature',
    }),
    model: 'google/gemini-2.0-flash-001',
    tokensUsed: 150,
    promptTokens: 100,
    completionTokens: 50,
    tier: 'cheap',
  }),
  parseLLMJson: vi.fn().mockImplementation((content: string, fallback: unknown) => {
    try {
      return JSON.parse(content)
    } catch {
      return fallback
    }
  }),
}))

// ── Import after mocks ─────────────────────────────────────────────
import { extractPostMortem, getRelevantLessons } from '@/lib/learning/post-mortem'

const SAMPLE_TRADE = {
  id: 'trade-001',
  instrument: 'EUR_USD',
  direction: 'long' as const,
  strategy: 'trend' as const,
  entry_price: 1.08,
  exit_price: 1.09,
  pnl: 45.0,
  opened_at: '2026-03-01T00:00:00Z',
  closed_at: '2026-03-02T00:00:00Z',
  close_reason: 'take_profit',
}

describe('Post-Mortem: extractPostMortem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a trade lesson with correct fields from LLM analysis', async () => {
    await extractPostMortem(SAMPLE_TRADE)

    expect(mockInsert).toHaveBeenCalledTimes(1)

    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow).toMatchObject({
      trade_id: 'trade-001',
      instrument: 'EUR_USD',
      direction: 'long',
      process_quality: 4,
      entry_quality: 5,
      exit_quality: 3,
      would_take_again: true,
      tags: ['trend-follow'],
      market_condition: 'Strong uptrend with pullback',
      lesson: 'Entry timing was good but exit was premature',
    })
    // win_rate_context should contain scorecard data
    expect(insertedRow.win_rate_context).toEqual({ win_rate: 0.55, total_trades: 20, avg_pnl: 12.5 })
  })

  it('clamps quality scores to 1-5 range', async () => {
    // Override LLM to return out-of-range values
    const { callLLM } = await import('@/lib/services/openrouter')
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: JSON.stringify({
        process_quality: 10,
        entry_quality: -2,
        exit_quality: 0,
        would_take_again: false,
        tags: [],
        market_condition: 'Unknown',
        lesson: 'Out of range test',
      }),
      model: 'google/gemini-2.0-flash-001',
      tokensUsed: 100,
      promptTokens: 70,
      completionTokens: 30,
      tier: 'cheap',
    })

    await extractPostMortem(SAMPLE_TRADE)

    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow.process_quality).toBe(5) // clamped from 10
    expect(insertedRow.entry_quality).toBe(1)   // clamped from -2
    expect(insertedRow.exit_quality).toBe(1)    // clamped from 0
  })

  it('uses fallback when LLM throws', async () => {
    const { callLLM } = await import('@/lib/services/openrouter')
    vi.mocked(callLLM).mockRejectedValueOnce(new Error('API down'))

    await extractPostMortem(SAMPLE_TRADE)

    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow.process_quality).toBe(3)
    expect(insertedRow.lesson).toBe('Unable to analyze — LLM unavailable')
    expect(insertedRow.would_take_again).toBe(false)
  })
})

describe('Post-Mortem: getRelevantLessons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns deduplicated lessons from specific + general queries', async () => {
    const lessons = await getRelevantLessons('EUR_USD')

    expect(lessons.length).toBe(3) // 2 specific + 2 general - 1 duplicate = 3
    expect(lessons.map(l => l.lesson)).toContain('Trend was strong')
    expect(lessons.map(l => l.lesson)).toContain('Avoid counter-trend in high ADX')
    expect(lessons.map(l => l.lesson)).toContain('Gold respects round numbers')
  })

  it('includes instrument and tags in returned lessons', async () => {
    const lessons = await getRelevantLessons('EUR_USD')

    const goldLesson = lessons.find(l => l.instrument === 'XAU_USD')
    expect(goldLesson).toBeDefined()
    expect(goldLesson!.tags).toEqual(['mean-reversion'])
  })
})
