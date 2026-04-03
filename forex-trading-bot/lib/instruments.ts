import { supabase } from '@/lib/services/supabase'

/** Fallback instrument list — used if DB query fails */
const FALLBACK_INSTRUMENTS = [
  'XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD',
  // Added 2026-04-03 — see _bmad-output/analysis/trade-frequency-report.md
  'AUD_USD', 'GBP_USD', 'NZD_USD', 'XAG_USD', 'US500_USD', 'GER40_EUR',
]

export const FRIENDLY_NAMES_FALLBACK: Record<string, string> = {
  XAU_USD: 'Gold', EUR_GBP: 'EUR/GBP', EUR_USD: 'EUR/USD',
  USD_JPY: 'USD/JPY', BCO_USD: 'Oil', US30_USD: 'Dow Jones',
  AUD_USD: 'AUD/USD', GBP_USD: 'GBP/USD', NZD_USD: 'NZD/USD',
  XAG_USD: 'Silver', US500_USD: 'S&P 500', GER40_EUR: 'DAX',
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
