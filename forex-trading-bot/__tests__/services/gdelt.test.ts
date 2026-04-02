import { describe, it, expect, vi } from 'vitest'

// Mock fetch globally before importing
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getGeopoliticalSentiment, INSTRUMENT_GDELT_QUERIES } from '@/lib/services/gdelt'

describe('GDELT — Instrument Sentiment', () => {
  it('maps known instruments to geopolitical queries', () => {
    expect(INSTRUMENT_GDELT_QUERIES['XAU_USD']).toContain('gold')
    expect(INSTRUMENT_GDELT_QUERIES['EUR_USD']).toContain('eurozone')
    expect(INSTRUMENT_GDELT_QUERIES['BCO_USD']).toContain('oil')
    expect(INSTRUMENT_GDELT_QUERIES['USD_JPY']).toContain('japan')
    expect(INSTRUMENT_GDELT_QUERIES['US30_USD']).toContain('fed')
    expect(INSTRUMENT_GDELT_QUERIES['EUR_GBP']).toContain('sterling')
  })

  it('getGeopoliticalSentiment returns articles for known instrument', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          { title: 'Gold surges on conflict fears', url: 'http://test.com', source: 'Reuters', seendate: '20260402T120000Z' },
        ],
      }),
    })

    const result = await getGeopoliticalSentiment('XAU_USD')
    expect(result.articles.length).toBe(1)
    expect(result.articles[0].title).toContain('Gold')
    expect(result.articleCount).toBe(1)
  })

  it('returns empty on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await getGeopoliticalSentiment('EUR_USD')
    expect(result.articles).toEqual([])
    expect(result.articleCount).toBe(0)
  })

  it('uses fallback query for unknown instrument', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ articles: [] }),
    })

    const result = await getGeopoliticalSentiment('UNKNOWN_PAIR')
    expect(result.articleCount).toBe(0)
    // Verify fetch was called (meaning it used the fallback query)
    expect(mockFetch).toHaveBeenCalled()
  })
})
