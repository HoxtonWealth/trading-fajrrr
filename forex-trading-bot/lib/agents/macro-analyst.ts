import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { supabase } from '@/lib/services/supabase'
import { AgentScorecard } from './types'

const SYSTEM_PROMPT = `You are the Macro Analyst for a forex trading bot. You analyze economic events, central bank policy, and macro trends.

Given economic context for an instrument, output a JSON scorecard:
{
  "signal": "long" | "short" | "hold",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Rules:
- High-impact events within 30 minutes = recommend hold (risk off)
- Rate decisions, CPI, NFP are highest impact
- Central bank hawkish = currency bullish, dovish = bearish
- Gold benefits from uncertainty and dovish policy
- ALWAYS output valid JSON only, no markdown`

export async function runMacroAnalyst(instrument: string): Promise<AgentScorecard> {
  const fallback: AgentScorecard = {
    agent: 'macro',
    instrument,
    signal: 'hold',
    confidence: 0,
    reasoning: 'No economic data or LLM unavailable',
  }

  try {
    // Read upcoming economic events
    const { data: events } = await supabase
      .from('economic_events')
      .select('*')
      .gte('event_time', new Date().toISOString())
      .order('event_time', { ascending: true })
      .limit(5)

    // Read active prediction market signals if available
    const { data: pmSignals } = await supabase
      .from('prediction_signals')
      .select('*')
      .eq('status', 'active')
      .limit(5)

    const eventContext = events && events.length > 0
      ? events.map(e => `${e.event_name} (${e.impact}) at ${e.event_time}`).join('\n')
      : 'No upcoming events'

    const pmContext = pmSignals && pmSignals.length > 0
      ? `\n\nPREDICTION MARKET INTELLIGENCE:\n${pmSignals.map(s => `${s.signal_type}: ${s.description} (strength: ${s.strength})`).join('\n')}`
      : ''

    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Analyze macro context for ${instrument}:

Upcoming Events:
${eventContext}${pmContext}`,
      maxTokens: 200,
    })

    const parsed = parseLLMJson<{ signal: string; confidence: number; reasoning: string }>(
      response.content,
      { signal: 'hold', confidence: 0, reasoning: 'Failed to parse' }
    )

    return {
      agent: 'macro',
      instrument,
      signal: (['long', 'short', 'hold'].includes(parsed.signal) ? parsed.signal : 'hold') as 'long' | 'short' | 'hold',
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
    }
  } catch {
    return fallback
  }
}
