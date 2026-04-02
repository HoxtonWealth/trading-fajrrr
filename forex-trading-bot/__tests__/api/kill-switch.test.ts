import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to mock supabase before importing the module under test
vi.mock('@/lib/services/supabase', () => {
  const mockSingle = vi.fn()
  const mockEqInner = vi.fn(() => ({ single: mockSingle }))
  const mockEqOuter = vi.fn(() => ({ eq: mockEqInner, single: mockSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEqOuter }))
  const mockUpdateEq2 = vi.fn().mockResolvedValue({ error: null })
  const mockUpdateEq1 = vi.fn(() => ({ eq: mockUpdateEq2 }))
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq1 }))

  return {
    supabase: {
      from: vi.fn(() => ({
        select: mockSelect,
        update: mockUpdate,
      })),
    },
    _mocks: { mockSingle, mockSelect, mockUpdate, mockEqOuter, mockEqInner, mockUpdateEq1, mockUpdateEq2 },
  }
})

vi.mock('@/lib/services/telegram', () => ({
  alertCustom: vi.fn().mockResolvedValue(true),
}))

// Import after mocks
import { getKillSwitchState, toggleKillSwitch } from '@/lib/services/kill-switch'
import { _mocks } from '@/lib/services/supabase'

const { mockSingle } = _mocks as { mockSingle: ReturnType<typeof vi.fn> }

describe('Kill Switch Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getKillSwitchState returns inactive when value is inactive', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'inactive' }, error: null })
    const state = await getKillSwitchState()
    expect(state).toBe('inactive')
  })

  it('getKillSwitchState returns active when value is active', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'active' }, error: null })
    const state = await getKillSwitchState()
    expect(state).toBe('active')
  })

  it('getKillSwitchState returns inactive on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const state = await getKillSwitchState()
    expect(state).toBe('inactive')
  })

  it('toggleKillSwitch flips inactive to active', async () => {
    // First call (getKillSwitchState) returns inactive
    mockSingle.mockResolvedValueOnce({ data: { value: 'inactive' }, error: null })
    const result = await toggleKillSwitch()
    expect(result).toBe('active')
  })

  it('toggleKillSwitch flips active to inactive', async () => {
    mockSingle.mockResolvedValueOnce({ data: { value: 'active' }, error: null })
    const result = await toggleKillSwitch()
    expect(result).toBe('inactive')
  })
})
