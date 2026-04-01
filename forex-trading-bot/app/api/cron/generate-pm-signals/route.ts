import { NextResponse } from 'next/server'
import { detectMomentumSignals } from '@/lib/prediction/momentum-detector'
import { detectDivergenceSignals } from '@/lib/prediction/divergence-detector'
import { detectThresholdSignals } from '@/lib/prediction/threshold-detector'
import { processSignals } from '@/lib/prediction/quality-gate'
import { logCron } from '@/lib/services/cron-logger'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [momentum, divergence, threshold] = await Promise.all([
      detectMomentumSignals(),
      detectDivergenceSignals(),
      detectThresholdSignals(),
    ])

    const rawSignals = [
      ...momentum.map(s => ({ ...s, signalType: 'momentum' as const })),
      ...divergence.map(s => ({ ...s, signalType: 'divergence' as const })),
      ...threshold.map(s => ({ ...s, signalType: 'threshold' as const })),
    ]

    const result = await processSignals(rawSignals)

    const msg = rawSignals.length > 0
      ? `Found ${rawSignals.length} prediction market signals. ${result.stored} were strong enough to use, ${result.blocked} were too weak.`
      : `Scanned prediction markets for big probability moves — nothing unusual right now.`
    await logCron('generate-pm-signals', msg)

    return NextResponse.json({
      success: true,
      summary: `Detected ${rawSignals.length} signals. Stored: ${result.stored}, Blocked: ${result.blocked}`,
    })
  } catch (error) {
    await logCron('generate-pm-signals', `Failed to scan signals: ${error instanceof Error ? error.message : 'Unknown'}`, false).catch(() => {})
    console.error('[cron/generate-pm-signals] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
