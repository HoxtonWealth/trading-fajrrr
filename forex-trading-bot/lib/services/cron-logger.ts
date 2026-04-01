import { supabase } from './supabase'

/**
 * Logs a plain-English summary of what a cron job did.
 * Keeps only the last 50 logs per cron to avoid table bloat.
 */
export async function logCron(cronName: string, summary: string, success: boolean = true) {
  await supabase.from('cron_logs').insert({
    cron_name: cronName,
    summary,
    success,
  })

  // Cleanup: keep only last 50 per cron
  const { data: old } = await supabase
    .from('cron_logs')
    .select('id')
    .eq('cron_name', cronName)
    .order('created_at', { ascending: false })
    .range(50, 1000)

  if (old && old.length > 0) {
    await supabase
      .from('cron_logs')
      .delete()
      .in('id', old.map(r => r.id))
  }
}
