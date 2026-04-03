import { NextResponse } from 'next/server'
import { supabase } from '@/lib/services/supabase'
import { alertCustom } from '@/lib/services/telegram'

export async function GET() {
  const { data } = await supabase
    .from('system_state')
    .select('value')
    .eq('key', 'drawdown_reset_at')
    .single()

  const { data: latestEquity } = await supabase
    .from('equity_snapshots')
    .select('equity, drawdown_percent')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    drawdownResetAt: data?.value ?? null,
    currentDrawdown: latestEquity?.drawdown_percent ?? 0,
    currentEquity: latestEquity?.equity ?? 0,
  })
}

export async function POST() {
  const now = new Date().toISOString()

  // Upsert the drawdown_reset_at key
  const { error } = await supabase
    .from('system_state')
    .upsert(
      { key: 'drawdown_reset_at', value: now, updated_at: now },
      { onConflict: 'key' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  alertCustom(
    'Circuit Breaker Reset',
    `Drawdown baseline reset at ${now}. Next equity snapshot will calculate drawdown from current equity.`
  ).catch(() => {})

  return NextResponse.json({ success: true, resetAt: now })
}
