import { executePendingTrades } from './trade-executor'
import { monitorPositions } from './position-monitor'
import { checkCircuitBreakers } from './circuit-breakers'
import { checkWeekend } from './weekend-handler'
import { send } from './lib/telegram'

const LOOP_INTERVAL_MS = 60_000 // 60 seconds

async function runLoop() {
  const start = Date.now()

  try {
    // 1. Execute any pending trades from Vercel pipeline
    await executePendingTrades()

    // 2. Monitor open positions (trailing stops)
    await monitorPositions()

    // 3. Check circuit breakers (drawdown, daily loss)
    await checkCircuitBreakers()

    // 4. Check weekend transitions
    await checkWeekend()

    const elapsed = Date.now() - start
    if (elapsed > 30_000) {
      console.warn(`[monitor] Loop took ${elapsed}ms (> 30s)`)
    }
  } catch (error) {
    console.error('[monitor] Loop error:', error)
  }
}

async function main() {
  console.log('[monitor] Starting forex bot monitor...')
  await send('🟢 <b>Monitor Started</b>\nForex bot monitor is online.')

  // Run immediately, then every 60 seconds
  await runLoop()

  setInterval(runLoop, LOOP_INTERVAL_MS)

  // Keep alive
  process.on('SIGTERM', async () => {
    console.log('[monitor] Shutting down...')
    await send('🔴 <b>Monitor Stopped</b>\nForex bot monitor is shutting down.')
    process.exit(0)
  })
}

main().catch(console.error)
