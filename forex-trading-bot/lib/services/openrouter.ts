const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export type ModelTier = 'cheap' | 'strong'

const MODEL_MAP: Record<ModelTier, string> = {
  cheap: 'google/gemini-flash-1.5',
  strong: 'anthropic/claude-sonnet-4-20250514',
}

export interface LLMRequest {
  tier: ModelTier
  systemPrompt?: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface LLMResponse {
  content: string
  model: string
  tokensUsed: number
}

const MAX_RETRIES = 3
const TIMEOUT_MS = 30000

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set')
  }

  const model = MODEL_MAP[request.tier]
  const messages = []

  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt })
  }
  messages.push({ role: 'user', content: request.userPrompt })

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://forex-trading-bot.vercel.app',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: request.maxTokens ?? 1000,
          temperature: request.temperature ?? 0.3,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`)
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>
        usage?: { total_tokens: number }
        model: string
      }

      return {
        content: data.choices[0]?.message?.content ?? '',
        model: data.model,
        tokensUsed: data.usage?.total_tokens ?? 0,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
      }
    }
  }

  throw new Error(`OpenRouter failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
