import { describe, it, expect, vi } from 'vitest'

// Mock all external dependencies
vi.mock('@/lib/services/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'system_state') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, val: string) => ({
                single: vi.fn().mockResolvedValue({
                  data: val === 'kill_switch'
                    ? { value: 'active' }
                    : { value: 'false' },
                  error: null,
                }),
              })),
            }),
          }
        }
        // Default mock for other tables
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
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }),
    },
  }
})

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
