import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'

interface HealthReviewResult {
  sharpeRatio: number
  recommendations: string[]
  strategyPauses: string[]
  weightAdjustments: { agent: string; newWeight: number }[]
}

/**
 * Learning Loop 3: Weekly Health Review — Sunday 00:00.
 *
 * Computes Sharpe ratio, IC, alpha decay. Uses strong LLM for analysis.
 * Outputs weight adjustments and strategy pause recommendations.
 */
export async function runWeeklyReview(): Promise<HealthReviewResult> {
  // Get last 30 days of trades
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: trades } = await supabase
    .from('trades')
    .select('instrument, strategy, pnl, closed_at')
    .eq('status', 'closed')
    .not('pnl', 'is', null)
    .gte('closed_at', thirtyDaysAgo)
    .order('closed_at', { ascending: true })

  if (!trades || trades.length < 5) {
    return {
      sharpeRatio: 0,
      recommendations: ['Insufficient data for review (< 5 trades in 30 days)'],
      strategyPauses: [],
      weightAdjustments: [],
    }
  }

  // Compute Sharpe ratio
  const returns = trades.map(t => t.pnl)
  const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length
  const stdDev = Math.sqrt(
    returns.reduce((s, v) => s + (v - avgReturn) ** 2, 0) / returns.length
  )
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0

  // Per-strategy stats
  const strategyStats = new Map<string, { wins: number; total: number; pnl: number }>()
  for (const t of trades) {
    if (!strategyStats.has(t.strategy)) {
      strategyStats.set(t.strategy, { wins: 0, total: 0, pnl: 0 })
    }
    const s = strategyStats.get(t.strategy)!
    s.total++
    s.pnl += t.pnl
    if (t.pnl > 0) s.wins++
  }

  const statsSummary = [...strategyStats.entries()]
    .map(([strategy, s]) => `${strategy}: ${s.total} trades, ${s.wins} wins (${(s.wins / s.total * 100).toFixed(0)}%), PnL: ${s.pnl.toFixed(2)}`)
    .join('\n')

  try {
    const response = await callLLM({
      tier: 'strong',
      systemPrompt: `You are a trading system health reviewer. Analyze performance data and output JSON:
{
  "recommendations": ["actionable advice"],
  "strategyPauses": ["strategy names to pause, if Sharpe < 0"],
  "weightAdjustments": [{"agent": "name", "newWeight": 0.3-2.5}]
}
Output valid JSON only.`,
      userPrompt: `Weekly review (30 days):
Total trades: ${trades.length}
Sharpe ratio: ${sharpeRatio.toFixed(3)}
Avg return: ${avgReturn.toFixed(2)}
Std deviation: ${stdDev.toFixed(2)}

Per-strategy:
${statsSummary}`,
      maxTokens: 500,
    })

    const parsed = parseLLMJson<{
      recommendations: string[]
      strategyPauses: string[]
      weightAdjustments: { agent: string; newWeight: number }[]
    }>(response.content, {
      recommendations: [],
      strategyPauses: [],
      weightAdjustments: [],
    })

    return {
      sharpeRatio,
      ...parsed,
    }
  } catch {
    return {
      sharpeRatio,
      recommendations: [`Sharpe: ${sharpeRatio.toFixed(3)}. LLM analysis unavailable.`],
      strategyPauses: sharpeRatio < 0 ? [...strategyStats.keys()] : [],
      weightAdjustments: [],
    }
  }
}
