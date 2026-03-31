import { NextResponse } from 'next/server'
import { runPipeline, PipelineResult } from '@/lib/pipeline'

const INSTRUMENTS = ['XAU_USD', 'EUR_GBP', 'EUR_USD', 'USD_JPY', 'BCO_USD', 'US30_USD']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: PipelineResult[] = []

    for (const instrument of INSTRUMENTS) {
      try {
        const result = await runPipeline(instrument)
        results.push(result)
      } catch (error) {
        console.error(`[cron/run-pipeline] Error for ${instrument}:`, error)
        results.push({
          action: 'none',
          instrument,
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('[cron/run-pipeline] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
