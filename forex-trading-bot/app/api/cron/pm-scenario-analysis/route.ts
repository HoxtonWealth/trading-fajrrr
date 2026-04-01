import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { callLLM, parseLLMJson } from '@/lib/services/openrouter'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all active PM signals
    const { data: signals } = await supabase
      .from('prediction_signals')
      .select('*, pm_markets(title, category)')
      .eq('status', 'active')
      .order('strength', { ascending: false })
      .limit(10)

    if (!signals || signals.length === 0) {
      return NextResponse.json({ success: true, summary: 'No active PM signals for scenario analysis' })
    }

    const signalSummary = signals.map(s =>
      `[${s.signal_type}] ${s.description} (strength: ${s.strength.toFixed(2)}, direction: ${s.direction})`
    ).join('\n')

    const response = await callLLM({
      tier: 'strong',
      systemPrompt: `You synthesize prediction market signals into a macro narrative for forex trading. Output JSON:
{
  "narrative": "coherent macro story connecting the signals",
  "instrumentImpacts": [{"instrument": "XAU_USD", "bias": "bullish|bearish", "confidence": 0.0-1.0}],
  "confidence": 0.0-1.0
}
Instruments: XAU_USD, EUR_GBP, EUR_USD, USD_JPY, BCO_USD, US30_USD.
Output valid JSON only.`,
      userPrompt: `Synthesize these active prediction market signals into a macro narrative:\n\n${signalSummary}`,
      maxTokens: 600,
    })

    const parsed = parseLLMJson<{
      narrative: string
      instrumentImpacts: Array<{ instrument: string; bias: string; confidence: number }>
      confidence: number
    }>(response.content, {
      narrative: 'Unable to parse',
      instrumentImpacts: [],
      confidence: 0,
    })

    // Store as llm_scenario signal if confidence is high enough
    if (parsed.confidence >= 0.6 && parsed.instrumentImpacts.length > 0) {
      const instruments = parsed.instrumentImpacts.map(i => i.instrument)
      const dominantBias = parsed.instrumentImpacts[0]?.bias === 'bullish' ? 'bullish' : 'bearish'

      await supabase.from('prediction_signals').insert({
        signal_type: 'llm_scenario',
        description: parsed.narrative,
        strength: parsed.confidence,
        instruments,
        direction: dominantBias,
        status: 'active',
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      })
    }

    const msg = parsed.confidence >= 0.6
      ? `AI built a macro story from prediction markets: "${parsed.narrative.slice(0, 120)}..." — applies to ${parsed.instrumentImpacts.length} of our markets.`
      : signals.length > 0
        ? `Reviewed ${signals.length} prediction market signals but confidence was too low to act on (${(parsed.confidence * 100).toFixed(0)}%).`
        : `No active prediction market signals to analyze right now.`
    await logCron('pm-scenario-analysis', msg)

    return NextResponse.json({
      success: true,
      summary: `Scenario analysis: confidence=${parsed.confidence.toFixed(2)}, impacts=${parsed.instrumentImpacts.length} instruments`,
    })
  } catch (error) {
    await logCron('pm-scenario-analysis', `Failed: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/pm-scenario-analysis] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
