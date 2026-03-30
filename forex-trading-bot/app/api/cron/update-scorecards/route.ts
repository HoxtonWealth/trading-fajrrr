import { NextResponse } from 'next/server'
import { updateScorecards } from '@/lib/learning/scorecard-updater'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await updateScorecards()

    return NextResponse.json({
      success: true,
      summary: `Updated ${result.updated} scorecard(s)`,
    })
  } catch (error) {
    console.error('[cron/update-scorecards] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
