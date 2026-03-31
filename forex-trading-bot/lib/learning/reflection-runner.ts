import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'

interface ReflectionResult {
  patterns: { type: string; description: string }[]
  recommendations: string
}

/**
 * Learning Loop 2: Reflection — every 10 trades.
 *
 * Sends a batch of closed trades to a cheap LLM for pattern analysis.
 * Stores insights in `reflections` table. Recent reflections are
 * injected into analyst prompts.
 */
export async function runReflection(): Promise<{ reflected: boolean; batchSize: number }> {
  // Count total closed trades
  const { count } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'closed')

  const totalClosed = count ?? 0

  // Get last reflection's batch end
  const { data: lastReflection } = await supabase
    .from('reflections')
    .select('trade_batch_end')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const lastBatchEnd = lastReflection?.trade_batch_end ?? 0

  // Only reflect every 10 trades
  if (totalClosed - lastBatchEnd < 10) {
    return { reflected: false, batchSize: 0 }
  }

  // Get the batch of trades
  const { data: trades } = await supabase
    .from('trades')
    .select('instrument, direction, strategy, entry_price, exit_price, pnl, close_reason')
    .eq('status', 'closed')
    .not('pnl', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(10)

  if (!trades || trades.length === 0) {
    return { reflected: false, batchSize: 0 }
  }

  const tradesSummary = trades.map((t, i) =>
    `${i + 1}. ${t.instrument} ${t.direction} (${t.strategy}): entry=${t.entry_price}, exit=${t.exit_price}, PnL=${t.pnl?.toFixed(2)}, reason=${t.close_reason}`
  ).join('\n')

  try {
    const response = await callLLM({
      tier: 'cheap',
      systemPrompt: `You analyze batches of forex trades for patterns. Output JSON:
{
  "patterns": [{"type": "win_pattern|loss_pattern|timing|instrument", "description": "what you found"}],
  "recommendations": "brief actionable advice"
}
Output valid JSON only.`,
      userPrompt: `Analyze these 10 recent trades:\n\n${tradesSummary}`,
      maxTokens: 500,
    })

    const result = parseLLMJson<ReflectionResult>(
      response.content,
      { patterns: [], recommendations: 'Unable to analyze' }
    )

    await supabase.from('reflections').insert({
      trade_batch_start: lastBatchEnd + 1,
      trade_batch_end: totalClosed,
      patterns: result.patterns,
      recommendations: result.recommendations,
    })

    return { reflected: true, batchSize: trades.length }
  } catch {
    return { reflected: false, batchSize: 0 }
  }
}
