import { describe, it, expect } from 'vitest'
import { shouldEnterWeekend, shouldExitWeekend } from '@/lib/risk/weekend-handler'

describe('shouldEnterWeekend', () => {
  it('true on Friday 20:00 UTC', () => {
    const friday8pm = new Date('2026-03-27T20:00:00Z') // Friday
    expect(shouldEnterWeekend(friday8pm)).toBe(true)
  })

  it('true on Friday 19:30 UTC exactly', () => {
    const friday730 = new Date('2026-03-27T19:30:00Z')
    expect(shouldEnterWeekend(friday730)).toBe(true)
  })

  it('false on Friday 19:00 UTC (before cutoff)', () => {
    const friday7pm = new Date('2026-03-27T19:00:00Z')
    expect(shouldEnterWeekend(friday7pm)).toBe(false)
  })

  it('true on Saturday', () => {
    const saturday = new Date('2026-03-28T12:00:00Z')
    expect(shouldEnterWeekend(saturday)).toBe(true)
  })

  it('true on Sunday before 22:00', () => {
    const sundayMorning = new Date('2026-03-29T10:00:00Z')
    expect(shouldEnterWeekend(sundayMorning)).toBe(true)
  })

  it('false on Sunday 22:00 (market reopens)', () => {
    const sunday10pm = new Date('2026-03-29T22:00:00Z')
    expect(shouldEnterWeekend(sunday10pm)).toBe(false)
  })

  it('false on Wednesday', () => {
    const wednesday = new Date('2026-03-25T15:00:00Z')
    expect(shouldEnterWeekend(wednesday)).toBe(false)
  })
})

describe('shouldExitWeekend', () => {
  it('true on Sunday 22:00 UTC', () => {
    const sunday10pm = new Date('2026-03-29T22:00:00Z')
    expect(shouldExitWeekend(sunday10pm)).toBe(true)
  })

  it('true on Monday', () => {
    const monday = new Date('2026-03-30T10:00:00Z')
    expect(shouldExitWeekend(monday)).toBe(true)
  })

  it('false on Saturday', () => {
    const saturday = new Date('2026-03-28T12:00:00Z')
    expect(shouldExitWeekend(saturday)).toBe(false)
  })

  it('false on Sunday before 22:00', () => {
    const sundayMorning = new Date('2026-03-29T10:00:00Z')
    expect(shouldExitWeekend(sundayMorning)).toBe(false)
  })
})
