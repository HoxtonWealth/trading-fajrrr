import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { AgentScorecard, DebateArgument } from './types'

const SYSTEM_PROMPT = `You are the Bear Researcher for a forex trading bot. Your job is to argue AGAINST the proposed trade.

Given analyst scorecards, the Bull's argument, and market data, build the strongest possible counter-case.

Output JSON:
{
  "argument": "your full counter-argument",
  "keyPoints": ["point1", "point2", "point3"]
}

Rules:
- Directly counter the Bull's key points
- Highlight risks the Bull downplayed
- Be specific — cite data that contradicts the bull case
- ALWAYS output valid JSON only, no markdown`

export async function runBearResearcher(
  instrument: string,
  scorecards: AgentScorecard[],
  bullArgument: DebateArgument,
): Promise<DebateArgument> {
  const fallback: DebateArgument = {
    role: 'bear',
    argument: 'Unable to generate bear argument',
    keyPoints: [],
  }

  try {
    const scorecardSummary = scorecards
      .map(s => `${s.agent}: ${s.signal} (confidence: ${s.confidence.toFixed(2)}) — ${s.reasoning}`)
      .join('\n')

    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Counter the bull case for ${instrument}:

Analyst Scorecards:
${scorecardSummary}

Bull's Argument:
${bullArgument.argument}

Bull's Key Points:
${bullArgument.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      maxTokens: 400,
    })

    const parsed = parseLLMJson<{ argument: string; keyPoints: string[] }>(
      response.content,
      { argument: 'Failed to parse', keyPoints: [] }
    )

    return { role: 'bear', argument: parsed.argument, keyPoints: parsed.keyPoints }
  } catch {
    return fallback
  }
}
