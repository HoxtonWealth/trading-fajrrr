import { runTechnicalAnalyst } from '@/lib/agents/technical-analyst'
import { runSentimentAnalyst } from '@/lib/agents/sentiment-analyst'
import { runMacroAnalyst } from '@/lib/agents/macro-analyst'
import { runRegimeAnalyst } from '@/lib/agents/regime-analyst'
import { runBullResearcher } from '@/lib/agents/bull-researcher'
import { runBearResearcher } from '@/lib/agents/bear-researcher'
import { runChiefAnalyst } from '@/lib/agents/chief-analyst'
import { AgentScorecard, ChiefDecision } from '@/lib/agents/types'
import { supabase } from '@/lib/services/supabase'

export interface AgentPipelineResult {
  decision: ChiefDecision
  scorecards: AgentScorecard[]
  usedAgents: boolean
}

const CONFIDENCE_THRESHOLD = 0.4

/**
 * Full multi-agent pipeline.
 *
 * 1. Run 4 analysts in parallel
 * 2. Run Bull researcher
 * 3. Run Bear researcher (sees Bull's argument)
 * 4. Run Chief Analyst
 * 5. Return decision
 *
 * Falls back to technical-only if LLM calls fail.
 */
export async function runAgentPipeline(
  instrument: string,
  indicators: {
    ema_20: number; ema_50: number; adx_14: number; atr_14: number;
    rsi_14: number | null; bb_upper: number | null; bb_middle: number | null; bb_lower: number | null;
    close: number;
  },
): Promise<AgentPipelineResult> {
  // Step 1: Run 4 analysts in parallel
  const [technical, sentiment, macro] = await Promise.all([
    runTechnicalAnalyst(instrument, indicators),
    runSentimentAnalyst(instrument),
    runMacroAnalyst(instrument),
  ])

  const regime = runRegimeAnalyst(
    instrument,
    indicators.adx_14,
    indicators.ema_20 > indicators.ema_50,
  )

  const scorecards = [technical, sentiment, macro, regime]

  // Check if we have meaningful LLM responses (at least technical should work)
  const hasLLMResponses = technical.confidence > 0 || sentiment.confidence > 0

  if (!hasLLMResponses) {
    // Fallback: no agents worked, return regime analyst's view only
    return {
      decision: {
        decision: regime.signal,
        confidence: regime.confidence,
        reasoning: 'Agent fallback: LLM unavailable, using regime detection only',
        agentAgreement: 1,
      },
      scorecards,
      usedAgents: false,
    }
  }

  // Load agent weights from scorecards table
  const { data: weightRows } = await supabase
    .from('agent_scorecards')
    .select('agent, weight')
    .eq('instrument', instrument)

  const weights: Record<string, number> = {}
  if (weightRows) {
    for (const row of weightRows) {
      if (row.weight != null) weights[row.agent] = row.weight
    }
  }

  // Step 2-3: Bull/Bear debate (sequential — Bear sees Bull's argument)
  const bullArg = await runBullResearcher(instrument, scorecards)
  const bearArg = await runBearResearcher(instrument, scorecards, bullArg)

  // Step 4: Chief Analyst makes final call
  const decision = await runChiefAnalyst(instrument, scorecards, bullArg, bearArg, weights)

  // Store agent predictions for scorecard tracking
  if (decision.decision !== 'hold') {
    await supabase.from('trade_agent_predictions').insert(
      scorecards.map(s => ({
        instrument,
        agent: s.agent,
        predicted_signal: s.signal,
        confidence: s.confidence,
        chief_decision: decision.decision,
        created_at: new Date().toISOString(),
      }))
    )
  }

  return {
    decision,
    scorecards,
    usedAgents: true,
  }
}
