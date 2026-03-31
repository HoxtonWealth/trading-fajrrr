import { NextResponse } from 'next/server'
import { detectMomentumSignals } from '@/lib/prediction/momentum-detector'
import { detectDivergenceSignals } from '@/lib/prediction/divergence-detector'
import { detectThresholdSignals } from '@/lib/prediction/threshold-detector'
import { processSignals } from '@/lib/prediction/quality-gate'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Run all 3 detectors
    const [momentum, divergence, threshold] = await Promise.all([
      detectMomentumSignals(),
      detectDivergenceSignals(),
      detectThresholdSignals(),
    ])

    // Combine into raw signals for quality gate
    const rawSignals = [
      ...momentum.map(s => ({ ...s, signalType: 'momentum' as const })),
      ...divergence.map(s => ({ ...s, signalType: 'divergence' as const })),
      ...threshold.map(s => ({ ...s, signalType: 'threshold' as const })),
    ]

    const result = await processSignals(rawSignals)

    return NextResponse.json({
      success: true,
      summary: `Detected ${rawSignals.length} signals (momentum: ${momentum.length}, divergence: ${divergence.length}, threshold: ${threshold.length}). Stored: ${result.stored}, Blocked: ${result.blocked}`,
    })
  } catch (error) {
    console.error('[cron/generate-pm-signals] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
