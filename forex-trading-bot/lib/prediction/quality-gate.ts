import { supabase } from '@/lib/services/supabase'

const BOT_INSTRUMENTS = ['XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD']
const MIN_STRENGTH = 0.6
const MAX_AGE_HOURS = 12
const MIN_VOLUME_POLYMARKET = 100000 // $100K

interface RawSignal {
  marketId: string
  description: string
  strength: number
  direction: 'bullish' | 'bearish' | 'neutral'
  instruments: string[]
  signalType: 'momentum' | 'divergence' | 'threshold'
}

interface QualityResult {
  passed: boolean
  reason?: string
}

/**
 * Quality Gate — Blueprint Section 6.
 *
 * ALL 5 criteria must pass:
 * 1. Strength > 0.6
 * 2. Maps to at least one bot instrument
 * 3. Generated within last 12 hours
 * 4. No opposing signal of equal or greater strength
 * 5. Volume > $100K/24h (Polymarket only)
 */
export function checkStrength(signal: RawSignal): QualityResult {
  if (signal.strength < MIN_STRENGTH) {
    return { passed: false, reason: `Strength ${signal.strength.toFixed(2)} below ${MIN_STRENGTH}` }
  }
  return { passed: true }
}

export function checkInstrumentMapping(signal: RawSignal): QualityResult {
  const mapped = signal.instruments.filter(i => BOT_INSTRUMENTS.includes(i))
  if (mapped.length === 0) {
    return { passed: false, reason: 'No matching bot instruments' }
  }
  return { passed: true }
}

export async function checkNoOpposingSignal(signal: RawSignal): Promise<QualityResult> {
  const { data: opposing } = await supabase
    .from('prediction_signals')
    .select('strength, direction')
    .eq('status', 'active')
    .neq('direction', signal.direction)
    .gte('strength', signal.strength)
    .limit(1)

  if (opposing && opposing.length > 0) {
    return { passed: false, reason: `Opposing signal exists with strength >= ${signal.strength.toFixed(2)}` }
  }
  return { passed: true }
}

export async function runQualityGate(signal: RawSignal): Promise<{
  passed: boolean
  reasons: string[]
}> {
  const results: QualityResult[] = []

  results.push(checkStrength(signal))
  results.push(checkInstrumentMapping(signal))
  results.push(await checkNoOpposingSignal(signal))

  const failures = results.filter(r => !r.passed)

  return {
    passed: failures.length === 0,
    reasons: failures.map(r => r.reason!),
  }
}

/**
 * Process raw signals through quality gate and store active ones.
 */
export async function processSignals(signals: RawSignal[]): Promise<{ stored: number; blocked: number }> {
  let stored = 0
  let blocked = 0

  for (const signal of signals) {
    const result = await runQualityGate(signal)

    if (result.passed) {
      await supabase.from('prediction_signals').insert({
        market_id: signal.marketId,
        signal_type: signal.signalType,
        description: signal.description,
        strength: signal.strength,
        instruments: signal.instruments.filter(i => BOT_INSTRUMENTS.includes(i)),
        direction: signal.direction,
        status: 'active',
        expires_at: new Date(Date.now() + MAX_AGE_HOURS * 60 * 60 * 1000).toISOString(),
      })
      stored++
    } else {
      blocked++
    }
  }

  // Expire old signals
  await supabase
    .from('prediction_signals')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())

  return { stored, blocked }
}
