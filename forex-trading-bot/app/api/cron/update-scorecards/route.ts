import { NextResponse } from 'next/server'
import { updateScorecards } from '@/lib/learning/scorecard-updater'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await updateScorecards()

    const msg = result.updated > 0
      ? `Reviewed ${result.updated} strategy performance reports. Win rates and agent weights updated.`
      : `No closed trades to review yet — scorecards will update once trades finish.`
    await logCron('update-scorecards', msg)

    return NextResponse.json({ success: true, summary: `Updated ${result.updated} scorecard(s)` })
  } catch (error) {
    await logCron('update-scorecards', `Failed: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/update-scorecards] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
