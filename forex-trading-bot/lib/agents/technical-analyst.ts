import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { AgentScorecard } from './types'

const SYSTEM_PROMPT = `You are the Technical Analyst for a forex trading bot. You analyze price action, indicators, and chart patterns.

Given market data for an instrument, output a JSON scorecard:
{
  "signal": "long" | "short" | "hold",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Rules:
- EMA(20) > EMA(50) with ADX > 25 = strong trend signal
- EMA crossover with ADX 20-25 = weak signal, lower confidence
- RSI > 70 in uptrend = caution, RSI < 30 in downtrend = caution
- ATR increasing = volatility expanding, adjust confidence
- ALWAYS output valid JSON only, no markdown`

export async function runTechnicalAnalyst(
  instrument: string,
  indicators: {
    ema_20: number; ema_50: number; adx_14: number; atr_14: number;
    rsi_14: number | null; bb_upper: number | null; bb_middle: number | null; bb_lower: number | null;
    close: number;
  }
): Promise<AgentScorecard> {
  const fallback: AgentScorecard = {
    agent: 'technical',
    instrument,
    signal: 'hold',
    confidence: 0,
    reasoning: 'LLM unavailable, defaulting to hold',
  }

  try {
    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Analyze ${instrument}:
EMA(20): ${indicators.ema_20.toFixed(4)}, EMA(50): ${indicators.ema_50.toFixed(4)}
ADX(14): ${indicators.adx_14.toFixed(2)}, ATR(14): ${indicators.atr_14.toFixed(4)}
RSI(14): ${indicators.rsi_14?.toFixed(2) ?? 'N/A'}
BB Upper: ${indicators.bb_upper?.toFixed(4) ?? 'N/A'}, Middle: ${indicators.bb_middle?.toFixed(4) ?? 'N/A'}, Lower: ${indicators.bb_lower?.toFixed(4) ?? 'N/A'}
Close: ${indicators.close.toFixed(4)}`,
      maxTokens: 200,
    })

    const parsed = parseLLMJson<{ signal: string; confidence: number; reasoning: string }>(
      response.content,
      { signal: 'hold', confidence: 0, reasoning: 'Failed to parse response' }
    )

    return {
      agent: 'technical',
      instrument,
      signal: (['long', 'short', 'hold'].includes(parsed.signal) ? parsed.signal : 'hold') as 'long' | 'short' | 'hold',
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
    }
  } catch {
    return fallback
  }
}
