import { describe, it, expect } from 'vitest'
import { scoreInstrument, rankInstruments, DEFAULT_WEIGHTS } from '@/lib/intelligence/screener'

describe('Market Screener', () => {
  it('scoreInstrument produces correct weighted composite', () => {
    const scores = {
      volatility: 0.8,
      trend: 0.6,
      news_catalyst: 0.4,
      calendar_proximity: 0.2,
      historical_edge: 0.7,
      pm_signal: 0.5,
    }
    const composite = scoreInstrument(scores, DEFAULT_WEIGHTS)
    // 0.8*0.2 + 0.6*0.25 + 0.4*0.15 + 0.2*0.1 + 0.7*0.2 + 0.5*0.1
    // = 0.16 + 0.15 + 0.06 + 0.02 + 0.14 + 0.05 = 0.58
    expect(composite).toBeCloseTo(0.58, 2)
  })

  it('scoreInstrument returns 0 for all-zero scores', () => {
    const scores = { volatility: 0, trend: 0, news_catalyst: 0, calendar_proximity: 0, historical_edge: 0, pm_signal: 0 }
    expect(scoreInstrument(scores, DEFAULT_WEIGHTS)).toBe(0)
  })

  it('scoreInstrument returns 1 for all-one scores', () => {
    const scores = { volatility: 1, trend: 1, news_catalyst: 1, calendar_proximity: 1, historical_edge: 1, pm_signal: 1 }
    expect(scoreInstrument(scores, DEFAULT_WEIGHTS)).toBeCloseTo(1.0, 2)
  })

  it('rankInstruments sorts descending by composite', () => {
    const items = [
      { instrument: 'A', composite: 0.3 },
      { instrument: 'B', composite: 0.8 },
      { instrument: 'C', composite: 0.5 },
    ]
    const ranked = rankInstruments(items, 3, 0.1)
    expect(ranked[0].instrument).toBe('B')
    expect(ranked[1].instrument).toBe('C')
    expect(ranked[2].instrument).toBe('A')
  })

  it('rankInstruments respects maxN limit', () => {
    const items = [
      { instrument: 'A', composite: 0.3 },
      { instrument: 'B', composite: 0.8 },
      { instrument: 'C', composite: 0.5 },
    ]
    const ranked = rankInstruments(items, 2, 0.1)
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

  it('DEFAULT_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })
})
