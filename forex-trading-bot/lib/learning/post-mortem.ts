import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'

interface ClosedTrade {
  id: string
  instrument: string
  direction: 'long' | 'short'
  strategy: 'trend' | 'mean_reversion'
  entry_price: number
  exit_price: number | null
  pnl: number | null
  opened_at: string
  closed_at: string | null
  close_reason: string | null
}

interface PostMortemResult {
  process_quality: number
  entry_quality: number
  exit_quality: number
  would_take_again: boolean
  tags: string[]
  market_condition: string
  lesson: string
}

const FALLBACK: PostMortemResult = {
  process_quality: 3,
  entry_quality: 3,
  exit_quality: 3,
  would_take_again: false,
  tags: [],
  market_condition: 'Unknown',
  lesson: 'Unable to analyze — LLM unavailable',
}

export async function extractPostMortem(trade: ClosedTrade): Promise<void> {
  // Gather context: candles around the trade window
  const { data: candles } = await supabase
    .from('candles')
    .select('time, open, high, low, close')
    .eq('instrument', trade.instrument)
    .eq('granularity', 'H4')
    .gte('time', trade.opened_at)
    .lte('time', trade.closed_at ?? new Date().toISOString())
    .order('time', { ascending: true })

  // Get scorecard context for win rate
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('win_rate, total_trades, avg_pnl')
    .eq('instrument', trade.instrument)

  const candleSummary = (candles ?? [])
    .slice(0, 10)
    .map(c => `${c.time}: O=${c.open} H=${c.high} L=${c.low} C=${c.close}`)
    .join('\n')

  let result: PostMortemResult

  try {
    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: `You analyze closed forex trades and extract lessons. Output JSON:
{
  "process_quality": 1-5 (was the trading process good regardless of P&L outcome?),
  "entry_quality": 1-5 (timing and price level of entry),
  "exit_quality": 1-5 (held too long=1, cut too early=2, just right=5),
  "would_take_again": boolean,
  "tags": ["trend-follow", "news-driven", "mean-reversion", "counter-trend", etc.],
  "market_condition": "brief description of market state",
  "lesson": "one sentence — what should be learned from this trade"
}
Output ONLY valid JSON, no markdown.`,
      userPrompt: `Analyze this closed trade:
Instrument: ${trade.instrument}
Direction: ${trade.direction}
Strategy: ${trade.strategy}
Entry: ${trade.entry_price} at ${trade.opened_at}
Exit: ${trade.exit_price ?? 'unknown'} at ${trade.closed_at ?? 'unknown'}
P&L: $${trade.pnl?.toFixed(2) ?? 'unknown'}
Close reason: ${trade.close_reason ?? 'unknown'}

Candles during trade:
${candleSummary || 'No candle data available'}

Current instrument stats: ${JSON.stringify(scorecards?.[0] ?? {})}`,
      maxTokens: 300,
    })

    result = parseLLMJson<PostMortemResult>(response.content, FALLBACK)
  } catch {
    result = FALLBACK
  }

  // Clamp quality scores to 1-5
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)))

  await supabase.from('trade_lessons').insert({
    trade_id: trade.id,
    instrument: trade.instrument,
    direction: trade.direction,
    process_quality: clamp(result.process_quality),
    entry_quality: clamp(result.entry_quality),
    exit_quality: clamp(result.exit_quality),
    would_take_again: result.would_take_again,
    tags: Array.isArray(result.tags) ? result.tags : [],
    market_condition: result.market_condition,
    lesson: result.lesson,
    win_rate_context: scorecards?.[0] ?? {},
  })
}

export async function getRelevantLessons(instrument: string, limit = 5): Promise<Array<{ instrument: string; lesson: string; tags: string[] }>> {
  // Get instrument-specific lessons
  const { data: specific } = await supabase
    .from('trade_lessons')
    .select('instrument, lesson, tags')
    .eq('instrument', instrument)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Get recent general lessons from other instruments (for cross-learning)
  const { data: general } = await supabase
    .from('trade_lessons')
    .select('instrument, lesson, tags')
    .order('created_at', { ascending: false })
    .limit(3)

  const all = [...(specific ?? []), ...(general ?? [])]
  // Deduplicate by lesson text
  const seen = new Set<string>()
  return all.filter(l => {
    if (seen.has(l.lesson)) return false
    seen.add(l.lesson)
    return true
  })
}
