import { supabase } from '@/lib/services/supabase'
import { FLASH_CRASH_THRESHOLD, FLASH_CRASH_HALT_HOURS } from './constants'

export interface FlashCrashResult {
  detected: boolean
  movePct?: number
}

/**
 * Detect flash crash: equity drop >= 3% between two consecutive 5-min snapshots.
 */
export async function detectFlashCrash(): Promise<FlashCrashResult> {
  const { data: snapshots } = await supabase
    .from('equity_snapshots')
    .select('equity, created_at')
    .order('created_at', { ascending: false })
    .limit(2)

  if (snapshots && snapshots.length === 2) {
    const [latest, previous] = snapshots
    if (previous.equity > 0) {
      const changePct = (latest.equity - previous.equity) / previous.equity
      if (Math.abs(changePct) >= FLASH_CRASH_THRESHOLD) {
        return { detected: true, movePct: changePct * 100 }
      }
    }
  }

  return { detected: false }
}

export async function recordFlashCrashHalt(): Promise<void> {
  await supabase
    .from('system_state')
    .upsert({
      key: 'flash_crash_halt_at',
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
}

export async function isFlashCrashCooldown(): Promise<boolean> {
  const { data } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'flash_crash_halt_at')
    .single()

  if (!data?.value) return false
  const haltedAt = new Date(data.value)
  const cooldownEnd = new Date(haltedAt.getTime() + FLASH_CRASH_HALT_HOURS * 60 * 60 * 1000)
  return new Date() < cooldownEnd
}
