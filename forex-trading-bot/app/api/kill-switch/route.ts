import { NextResponse } from 'next/server'
import { getKillSwitchState, toggleKillSwitch } from '@/lib/services/kill-switch'

const KILL_SWITCH_SECRET = process.env.KILL_SWITCH_SECRET || process.env.CRON_SECRET

export async function GET() {
  const state = await getKillSwitchState()
  return NextResponse.json({ state })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${KILL_SWITCH_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const newState = await toggleKillSwitch()
    return NextResponse.json({ state: newState })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
