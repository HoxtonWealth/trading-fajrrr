import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { AgentScorecard, DebateArgument, ChiefDecision } from './types'
import { getRelevantLessons } from '@/lib/learning/post-mortem'
import { supabase } from '@/lib/services/supabase'

const SYSTEM_PROMPT = `You are the Chief Analyst for a forex trading bot. You make the final trading decision.

You receive:
1. Scorecards from 4 specialist analysts (with confidence weights)
2. A Bull/Bear debate

Your job: synthesize everything into a final decision.

Output JSON:
{
  "decision": "long" | "short" | "hold",
  "confidence": 0.0-1.0,
  "reasoning": "your synthesis",
  "agentAgreement": number (how many of 4 analysts agree with your decision)
}

Rules:
- Weight each analyst's view by their confidence score and historical weight
- When analysts disagree, lean toward "hold" (caution wins)
- Confidence below 0.4 = no trade
- NEVER override risk rules — you decide WHAT, risk code decides IF
- ALWAYS output valid JSON only, no markdown`

export async function runChiefAnalyst(
  instrument: string,
  scorecards: AgentScorecard[],
  bullArg: DebateArgument,
  bearArg: DebateArgument,
  agentWeights?: Record<string, number>,
): Promise<ChiefDecision> {
  const fallback: ChiefDecision = {
    decision: 'hold',
    confidence: 0,
    reasoning: 'Chief Analyst unavailable, defaulting to hold',
    agentAgreement: 0,
  }

  try {
    const weightedScorecards = scorecards
      .map(s => {
        const weight = agentWeights?.[s.agent] ?? 1.0
        return `${s.agent} (weight: ${weight.toFixed(2)}): ${s.signal} (confidence: ${s.confidence.toFixed(2)}) — ${s.reasoning}`
      })
      .join('\n')

    // Fetch relevant lessons from past trades
    let lessonsContext = ''
    try {
      const lessons = await getRelevantLessons(instrument, 3)
      if (lessons.length > 0) {
        lessonsContext = '\n\nPAST LESSONS (from trade post-mortems):\n' +
          lessons.map(l => `- [${l.instrument}] ${l.lesson} (tags: ${l.tags.join(', ')})`).join('\n')
      }
    } catch {
      // Non-critical — continue without lessons
    }

    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Make the final call for ${instrument}:

ANALYST SCORECARDS:
${weightedScorecards}

BULL CASE:
${bullArg.argument}
Key points: ${bullArg.keyPoints.join('; ')}

BEAR CASE:
${bearArg.argument}
Key points: ${bearArg.keyPoints.join('; ')}${lessonsContext}${await (async () => {
        try {
          const { data: reflections } = await supabase
            .from('reflections')
            .select('patterns, recommendations')
            .order('created_at', { ascending: false })
            .limit(2)
          if (reflections && reflections.length > 0) {
            const lines = reflections.flatMap(r => {
              const patterns = (r.patterns as Array<{ type: string; description: string }>) ?? []
              return [...patterns.map(p => `- [${p.type}] ${p.description}`), `Recommendation: ${r.recommendations}`]
            })
            return '\n\nSYSTEM REFLECTIONS (from recent trade batch analysis):\n' + lines.join('\n')
          }
        } catch { /* non-critical */ }
        return ''
      })()}`,
      maxTokens: 300,
    })

    const parsed = parseLLMJson<{ decision: string; confidence: number; reasoning: string; agentAgreement: number }>(
      response.content,
      { decision: 'hold', confidence: 0, reasoning: 'Failed to parse', agentAgreement: 0 }
    )

    return {
      decision: (['long', 'short', 'hold'].includes(parsed.decision) ? parsed.decision : 'hold') as 'long' | 'short' | 'hold',
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
      agentAgreement: parsed.agentAgreement,
    }
  } catch {
    return fallback
  }
}
