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

import { getActiveInstruments, getFriendlyNames, FRIENDLY_NAMES_FALLBACK } from '@/lib/instruments'

describe('Dynamic Instruments', () => {
  it('getActiveInstruments returns instruments from DB', async () => {
    const instruments = await getActiveInstruments()
    expect(instruments).toEqual(['EUR_USD', 'XAU_USD'])
  })

  it('getFriendlyNames includes DB names merged with fallbacks', async () => {
    const names = await getFriendlyNames()
    expect(names['EUR_USD']).toBe('EUR/USD')
    expect(names['XAU_USD']).toBe('Gold')
    // Fallback names should still be present for instruments not in DB response
    expect(names['BCO_USD']).toBe('Oil')
  })

  it('has fallback friendly names for all original instruments', () => {
    expect(FRIENDLY_NAMES_FALLBACK['XAU_USD']).toBe('Gold')
    expect(FRIENDLY_NAMES_FALLBACK['EUR_USD']).toBe('EUR/USD')
    expect(FRIENDLY_NAMES_FALLBACK['BCO_USD']).toBe('Oil')
    expect(FRIENDLY_NAMES_FALLBACK['US30_USD']).toBe('Dow Jones')
    expect(FRIENDLY_NAMES_FALLBACK['EUR_GBP']).toBe('EUR/GBP')
    expect(FRIENDLY_NAMES_FALLBACK['USD_JPY']).toBe('USD/JPY')
  })
})
