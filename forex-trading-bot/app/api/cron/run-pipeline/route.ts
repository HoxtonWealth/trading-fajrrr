import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/pipeline'

const INSTRUMENT = 'XAU_USD' // Phase 1: single instrument

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runPipeline(INSTRUMENT)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[cron/run-pipeline] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
