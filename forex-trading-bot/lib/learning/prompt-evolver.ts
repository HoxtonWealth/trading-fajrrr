import { supabase } from '@/lib/services/supabase'
import { callLLM } from '@/lib/services/openrouter'
import { MAX_EVOLUTION_ATTEMPTS_PER_MONTH, SHADOW_TEST_DAYS } from '@/lib/risk/constants'

/**
 * Learning Loop 4: Prompt Evolution — Monthly.
 *
 * 1. Identify worst-performing agent
 * 2. Generate new prompt via strong LLM
 * 3. Validate prompt (no risk-override language)
 * 4. Start 5-day shadow test
 */
export async function identifyWeakestAgent(): Promise<{ agent: string; instrument: string; winRate: number } | null> {
  const { data: scorecards } = await supabase
    .from('agent_scorecards')
    .select('agent, instrument, win_rate, total_trades')
    .gte('total_trades', 10) // Need minimum data
    .order('win_rate', { ascending: true })
    .limit(1)
    .single()

  if (!scorecards) return null
  return { agent: scorecards.agent, instrument: scorecards.instrument, winRate: scorecards.win_rate }
}

export async function generateEvolvedPrompt(
  agent: string,
  currentPrompt: string,
  reflections: string[],
): Promise<{ newPrompt: string; valid: boolean; reason?: string }> {
  // Check monthly evolution limit
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('prompt_versions')
    .select('*', { count: 'exact', head: true })
    .eq('agent', agent)
    .gte('created_at', monthStart.toISOString())

  if ((count ?? 0) >= MAX_EVOLUTION_ATTEMPTS_PER_MONTH) {
    return { newPrompt: '', valid: false, reason: `Monthly evolution limit reached (${MAX_EVOLUTION_ATTEMPTS_PER_MONTH})` }
  }

  const response = await callLLM({
    tier: 'strong',
    systemPrompt: `You are a prompt engineer evolving trading agent prompts. Given the current prompt and recent reflection insights, write an improved version.

RULES:
- NEVER include language that overrides risk limits
- NEVER suggest ignoring stop losses or position limits
- Focus on better signal detection and reasoning
- Keep the same output JSON format
- The prompt must be self-contained`,
    userPrompt: `Agent: ${agent}

Current prompt:
${currentPrompt}

Recent reflections:
${reflections.join('\n')}

Write an improved prompt that addresses weaknesses identified in reflections.`,
    maxTokens: 1000,
  })

  const newPrompt = response.content.trim()

  // Validate: check for risk-override language
  const valid = validatePrompt(newPrompt)

  if (valid) {
    await supabase.from('prompt_versions').insert({
      agent,
      prompt_text: newPrompt,
      status: 'shadow',
      shadow_start: new Date().toISOString(),
      shadow_end: new Date(Date.now() + SHADOW_TEST_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  return { newPrompt, valid, reason: valid ? undefined : 'Prompt contains risk-override language' }
}

const FORBIDDEN_PATTERNS = [
  /ignore.*risk/i,
  /override.*stop/i,
  /skip.*check/i,
  /bypass.*limit/i,
  /increase.*beyond.*max/i,
  /remove.*constraint/i,
  /disable.*safety/i,
]

export function validatePrompt(prompt: string): boolean {
  return !FORBIDDEN_PATTERNS.some(pattern => pattern.test(prompt))
}
