export interface AgentScorecard {
  agent: string
  instrument: string
  signal: 'long' | 'short' | 'hold'
  confidence: number // 0-1
  reasoning: string
}

export interface DebateArgument {
  role: 'bull' | 'bear'
  argument: string
  keyPoints: string[]
}

export interface ChiefDecision {
  decision: 'long' | 'short' | 'hold'
  confidence: number // 0-1
  reasoning: string
  agentAgreement: number // how many agents agreed
}
