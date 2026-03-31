import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { AgentScorecard, DebateArgument } from './types'

const SYSTEM_PROMPT = `You are the Bull Researcher for a forex trading bot. Your job is to argue FOR taking the proposed trade.

Given analyst scorecards and market data, build the strongest possible case for the trade.

Output JSON:
{
  "argument": "your full argument",
  "keyPoints": ["point1", "point2", "point3"]
}

Rules:
- Be specific — cite the data
- Acknowledge risks but explain why they are manageable
- ALWAYS output valid JSON only, no markdown`

export async function runBullResearcher(
  instrument: string,
  scorecards: AgentScorecard[],
): Promise<DebateArgument> {
  const fallback: DebateArgument = {
    role: 'bull',
    argument: 'Unable to generate bull argument',
    keyPoints: [],
  }

  try {
    const scorecardSummary = scorecards
      .map(s => `${s.agent}: ${s.signal} (confidence: ${s.confidence.toFixed(2)}) — ${s.reasoning}`)
      .join('\n')

    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Build a bull case for ${instrument}:\n\nAnalyst Scorecards:\n${scorecardSummary}`,
      maxTokens: 400,
    })

    const parsed = parseLLMJson<{ argument: string; keyPoints: string[] }>(
      response.content,
      { argument: 'Failed to parse', keyPoints: [] }
    )

    return { role: 'bull', argument: parsed.argument, keyPoints: parsed.keyPoints }
  } catch {
    return fallback
  }
}
