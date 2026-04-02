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
  it('detectSession returns asian for 03:00 UTC weekday', () => {
    const date = new Date('2026-04-06T03:00:00Z') // Monday
    expect(detectSession(date)).toBe('asian')
  })

  it('detectSession returns london for 10:00 UTC weekday', () => {
    const date = new Date('2026-04-06T10:00:00Z')
    expect(detectSession(date)).toBe('london')
  })

  it('detectSession returns overlap for 14:00 UTC weekday', () => {
    const date = new Date('2026-04-06T14:00:00Z')
    expect(detectSession(date)).toBe('overlap')
  })

  it('detectSession returns new_york for 18:00 UTC weekday', () => {
    const date = new Date('2026-04-06T18:00:00Z')
    expect(detectSession(date)).toBe('new_york')
  })

  it('detectSession returns off_hours for 22:00 UTC weekday', () => {
    const date = new Date('2026-04-06T22:00:00Z')
    expect(detectSession(date)).toBe('off_hours')
  })

  it('detectSession returns off_hours for weekend', () => {
    const saturday = new Date('2026-04-04T14:00:00Z') // Saturday
    expect(detectSession(saturday)).toBe('off_hours')
  })

  it('getSessionSchedule returns correct intervals for overlap', () => {
    const schedule = getSessionSchedule('overlap')
    expect(schedule.pipelineMinutes).toBe(15)
    expect(schedule.candleMinutes).toBe(15)
  })

  it('getSessionSchedule returns correct intervals for asian', () => {
    const schedule = getSessionSchedule('asian')
    expect(schedule.pipelineMinutes).toBe(120)
    expect(schedule.candleMinutes).toBe(30)
  })

  it('getSessionSchedule returns correct intervals for off_hours', () => {
    expect(getSessionSchedule('off_hours').pipelineMinutes).toBe(240)
  })

  it('shouldRunNow returns true for run-pipeline at aligned time during overlap', async () => {
    // Overlap, pipeline=15min. 14:00 = 840 min. 840 % 15 = 0 → run
    const now = new Date('2026-04-06T14:00:00Z')
    expect(await shouldRunNow('run-pipeline', now)).toBe(true)
  })

  it('shouldRunNow returns false for run-pipeline at non-aligned time during off_hours', async () => {
    // Off-hours, pipeline=240min. 22:15 = 1335 min. 1335 % 240 = 135 → skip
    const now = new Date('2026-04-06T22:15:00Z')
    expect(await shouldRunNow('run-pipeline', now)).toBe(false)
  })

  it('shouldRunNow returns true for unknown cron (always runs)', async () => {
    const now = new Date('2026-04-06T22:15:00Z')
    expect(await shouldRunNow('ingest-equity', now)).toBe(true)
  })
})
