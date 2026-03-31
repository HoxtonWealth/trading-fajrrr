import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { supabase } from '@/lib/services/supabase'
import { AgentScorecard } from './types'

const SYSTEM_PROMPT = `You are the Sentiment Analyst for a forex trading bot. You analyze news sentiment and market mood.

Given sentiment data for an instrument, output a JSON scorecard:
{
  "signal": "long" | "short" | "hold",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Rules:
- Sentiment score > +0.5 = bullish bias
- Sentiment score < -0.5 = bearish bias
- No recent news = low confidence hold
- Factor in headline context but NEVER override technical signals
- ALWAYS output valid JSON only, no markdown`

export async function runSentimentAnalyst(instrument: string): Promise<AgentScorecard> {
  const fallback: AgentScorecard = {
    agent: 'sentiment',
    instrument,
    signal: 'hold',
    confidence: 0,
    reasoning: 'No sentiment data or LLM unavailable',
  }

  try {
    const { data: sentiment } = await supabase
      .from('news_sentiment')
      .select('score, headline_count, headlines')
      .eq('instrument', instrument)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!sentiment) return fallback

    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Analyze sentiment for ${instrument}:
Sentiment Score: ${sentiment.score.toFixed(2)} (scale: -1.0 bearish to +1.0 bullish)
Headline Count: ${sentiment.headline_count}
Recent Headlines: ${JSON.stringify(sentiment.headlines?.slice(0, 5) ?? [])}`,
      maxTokens: 200,
    })

    const parsed = parseLLMJson<{ signal: string; confidence: number; reasoning: string }>(
      response.content,
      { signal: 'hold', confidence: 0, reasoning: 'Failed to parse' }
    )

    return {
      agent: 'sentiment',
      instrument,
      signal: (['long', 'short', 'hold'].includes(parsed.signal) ? parsed.signal : 'hold') as 'long' | 'short' | 'hold',
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
    }
  } catch {
    return fallback
  }
}
