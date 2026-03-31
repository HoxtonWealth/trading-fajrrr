/**
 * Maps prediction market signal categories to bot instruments with direction bias.
 */

export interface InstrumentImpact {
  instrument: string
  bias: 'bullish' | 'bearish'
  reasoning: string
}

const CATEGORY_MAP: Record<string, (direction: 'bullish' | 'bearish') => InstrumentImpact[]> = {
  rates: (dir) => [
    { instrument: 'EUR_USD', bias: dir === 'bullish' ? 'bearish' : 'bullish', reasoning: 'Rate cut = USD weaker = EUR/USD up' },
    { instrument: 'USD_JPY', bias: dir === 'bullish' ? 'bearish' : 'bullish', reasoning: 'Rate cut = USD weaker = USD/JPY down' },
    { instrument: 'XAU_USD', bias: dir === 'bullish' ? 'bullish' : 'bearish', reasoning: 'Rate cut = gold up (lower opportunity cost)' },
    { instrument: 'US30_USD', bias: dir, reasoning: 'Rate cut = equities up' },
  ],
  inflation: (dir) => [
    { instrument: 'XAU_USD', bias: dir, reasoning: 'Higher inflation = gold up (hedge)' },
    { instrument: 'EUR_USD', bias: dir === 'bullish' ? 'bearish' : 'bullish', reasoning: 'Higher inflation = USD volatile' },
  ],
  recession: (dir) => [
    { instrument: 'XAU_USD', bias: dir, reasoning: 'Recession fear = gold up (safe haven)' },
    { instrument: 'US30_USD', bias: dir === 'bullish' ? 'bearish' : 'bullish', reasoning: 'Recession = equities down' },
    { instrument: 'EUR_USD', bias: 'neutral' as 'bullish', reasoning: 'Recession impact mixed on EUR/USD' },
  ],
  energy: (dir) => [
    { instrument: 'BCO_USD', bias: dir, reasoning: 'Direct oil price impact' },
  ],
  geopolitical: (dir) => [
    { instrument: 'XAU_USD', bias: dir, reasoning: 'Geopolitical risk = gold up' },
    { instrument: 'US30_USD', bias: dir === 'bullish' ? 'bearish' : 'bullish', reasoning: 'Risk off = equities down' },
  ],
}

export function mapSignalToInstruments(
  category: string,
  direction: 'bullish' | 'bearish'
): InstrumentImpact[] {
  const mapper = CATEGORY_MAP[category]
  if (!mapper) return []
  return mapper(direction)
}
