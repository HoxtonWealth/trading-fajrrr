import { supabase } from '@/lib/services/supabase'
import { alertCustom } from '@/lib/services/telegram'

export type KillSwitchState = 'active' | 'inactive'

export async function getKillSwitchState(): Promise<KillSwitchState> {
  const { data, error } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'kill_switch')
    .single()

  if (error || !data) return 'inactive'
  return data.value === 'active' ? 'active' : 'inactive'
}

export async function toggleKillSwitch(): Promise<KillSwitchState> {
  const current = await getKillSwitchState()
  const next: KillSwitchState = current === 'active' ? 'inactive' : 'active'

  await supabase
    .from('system_state')
    .update({ value: next, updated_at: new Date().toISOString() })
    .eq('key', 'kill_switch')

  const emoji = next === 'active' ? '🛑' : '✅'
  alertCustom(
    `${emoji} Kill Switch ${next === 'active' ? 'ACTIVATED' : 'Deactivated'}`,
    `Trading ${next === 'active' ? 'halted' : 'resumed'} at ${new Date().toISOString()}`
  ).catch(() => {})

  return next
}
