import { NextResponse } from 'next/server'
import { runWeeklyReview } from '@/lib/learning/health-reviewer'
import { runReflection } from '@/lib/learning/reflection-runner'
import { alertWeeklyReview } from '@/lib/services/telegram'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Run reflection first (every 10 trades)
    const reflection = await runReflection()

    // Run weekly health review
    const review = await runWeeklyReview()

    await alertWeeklyReview({
      sharpeRatio: review.sharpeRatio,
      recommendations: review.recommendations,
      strategyPauses: review.strategyPauses,
    }).catch(() => {})

    const sharpeWord = review.sharpeRatio > 0.5 ? 'good' : review.sharpeRatio > 0 ? 'okay' : 'poor'
    const reflectionNote = reflection.reflected ? ` Also reviewed the last ${reflection.batchSize} trades for patterns.` : ''
    const pauseNote = review.strategyPauses.length > 0 ? ` Paused: ${review.strategyPauses.join(', ')}.` : ''
    const msg = `Weekly health check: performance is ${sharpeWord} (Sharpe: ${review.sharpeRatio.toFixed(2)}).${pauseNote}${reflectionNote}`
    await logCron('weekly-review', msg)

    return NextResponse.json({
      success: true,
      summary: {
        sharpeRatio: review.sharpeRatio.toFixed(3),
        recommendations: review.recommendations,
        strategyPauses: review.strategyPauses,
        weightAdjustments: review.weightAdjustments,
        reflected: reflection.reflected,
        reflectionBatchSize: reflection.batchSize,
      },
    })
  } catch (error) {
    console.error('[cron/weekly-review] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
