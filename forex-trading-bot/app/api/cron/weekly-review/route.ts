import { NextResponse } from 'next/server'
import { runWeeklyReview } from '@/lib/learning/health-reviewer'
import { runReflection } from '@/lib/learning/reflection-runner'
import { alertWeeklyReview } from '@/lib/services/telegram'

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
