import { NextResponse } from 'next/server'
import { runDiscovery } from '@/lib/intelligence/discovery'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDiscovery()

    const parts: string[] = []
    if (result.added.length > 0) parts.push(`Added ${result.added.join(', ')} to trading universe`)
    if (result.removed.length > 0) parts.push(`Removed ${result.removed.join(', ')}`)
    if (parts.length === 0) parts.push('No changes to instrument universe this week')

    const msg = `Weekly discovery: ${parts.join('. ')}.`
    await logCron('discover-instruments', msg)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const msg = `Discovery failed: ${error instanceof Error ? error.message : 'Unknown'}`
    await logCron('discover-instruments', msg, false).catch(() => {})
    console.error('[cron/discover-instruments] Error:', error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
