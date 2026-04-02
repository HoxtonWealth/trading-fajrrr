import { supabase } from '@/lib/services/supabase'

export type MarketSession = 'asian' | 'london' | 'overlap' | 'new_york' | 'off_hours'

interface SessionSchedule {
  pipelineMinutes: number
  candleMinutes: number
}

const SESSION_SCHEDULES: Record<MarketSession, SessionSchedule> = {
  asian:      { pipelineMinutes: 120, candleMinutes: 30 },
  london:     { pipelineMinutes: 30,  candleMinutes: 15 },
  new_york:   { pipelineMinutes: 30,  candleMinutes: 15 },
  overlap:    { pipelineMinutes: 15,  candleMinutes: 15 },
  off_hours:  { pipelineMinutes: 240, candleMinutes: 30 },
}

const CRON_INTERVALS: Record<string, keyof SessionSchedule> = {
  'run-pipeline': 'pipelineMinutes',
  'ingest-candles': 'candleMinutes',
}

export function detectSession(now: Date = new Date()): MarketSession {
  const hour = now.getUTCHours()
  const day = now.getUTCDay()

  // Weekend = off_hours
  if (day === 0 || day === 6) return 'off_hours'

  if (hour >= 13 && hour < 16) return 'overlap'
  if (hour >= 8 && hour < 13) return 'london'
  if (hour >= 16 && hour < 21) return 'new_york'
  if (hour >= 0 && hour < 8) return 'asian'
  return 'off_hours' // 21:00–00:00
}

export function getSessionSchedule(session: MarketSession): SessionSchedule {
  return SESSION_SCHEDULES[session]
}

/**
 * Smart skip pattern: called at the top of each cron route.
 * Returns true if this cron should actually execute now.
 * Returns false if it should skip (too frequent for current session).
 *
 * Crons not in CRON_INTERVALS always run (e.g., ingest-equity, poll-prediction-markets).
 */
export async function shouldRunNow(cronName: string, now: Date = new Date()): Promise<boolean> {
  const intervalKey = CRON_INTERVALS[cronName]
  if (!intervalKey) return true // Not a throttled cron — always run

  const session = detectSession(now)
  const schedule = SESSION_SCHEDULES[session]
  const intervalMinutes = schedule[intervalKey]

  const minute = now.getUTCMinutes()
  const hour = now.getUTCHours()
  const totalMinutes = hour * 60 + minute

  // Check if current time aligns with the interval
  if (totalMinutes % intervalMinutes !== 0) {
    return false
  }

  // Check event proximity — boost frequency near high-impact events
  try {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

    const { data: nearbyEvents } = await supabase
      .from('economic_events')
      .select('impact')
      .gte('event_time', oneHourAgo)
      .lte('event_time', oneHourAhead)

    const hasHighImpact = nearbyEvents?.some(e => e.impact === 'high')
    if (hasHighImpact) {
      // Near high-impact event — always run pipeline
      return true
    }
  } catch {
    // DB error — default to running
    return true
  }

  return true
}
