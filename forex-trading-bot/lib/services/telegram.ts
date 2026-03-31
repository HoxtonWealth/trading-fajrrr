/**
 * Telegram Bot API — direct HTTP POST, no library needed.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const TELEGRAM_API = 'https://api.telegram.org'

async function sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[telegram] Bot token or chat ID not configured, skipping alert')
    return false
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: parseMode,
      }),
    })

    if (!response.ok) {
      console.error(`[telegram] API error ${response.status}: ${await response.text()}`)
      return false
    }

    return true
  } catch (error) {
    console.error('[telegram] Failed to send message:', error)
    return false
  }
}

// --- Alert Types ---

export async function alertTradeOpened(trade: {
  instrument: string
  direction: string
  strategy: string
  units: number
  entryPrice: number
  stopLoss: number
  riskPercent: number
}): Promise<boolean> {
  return sendMessage(
    `📈 <b>Trade Opened</b>\n` +
    `${trade.direction.toUpperCase()} ${trade.instrument}\n` +
    `Strategy: ${trade.strategy}\n` +
    `Units: ${trade.units}\n` +
    `Entry: ${trade.entryPrice.toFixed(4)}\n` +
    `Stop: ${trade.stopLoss.toFixed(4)}\n` +
    `Risk: ${(trade.riskPercent * 100).toFixed(1)}%`
  )
}

export async function alertTradeClosed(trade: {
  instrument: string
  direction: string
  pnl: number
  closeReason: string
}): Promise<boolean> {
  const emoji = trade.pnl >= 0 ? '✅' : '❌'
  return sendMessage(
    `${emoji} <b>Trade Closed</b>\n` +
    `${trade.direction.toUpperCase()} ${trade.instrument}\n` +
    `P&L: $${trade.pnl.toFixed(2)}\n` +
    `Reason: ${trade.closeReason}`
  )
}

export async function alertCircuitBreaker(trigger: string, action: string): Promise<boolean> {
  return sendMessage(
    `🚨 <b>CIRCUIT BREAKER</b> 🚨\n` +
    `Trigger: ${trigger}\n` +
    `Action: ${action}\n` +
    `Time: ${new Date().toISOString()}`
  )
}

export async function alertWeekend(action: string, details: string): Promise<boolean> {
  return sendMessage(
    `🌙 <b>Weekend Mode</b>\n` +
    `Action: ${action}\n` +
    `${details}`
  )
}

export async function alertDailySummary(summary: {
  equity: number
  dailyPnl: number
  drawdown: number
  openPositions: number
  tradestoday: number
}): Promise<boolean> {
  const pnlEmoji = summary.dailyPnl >= 0 ? '📊' : '📉'
  return sendMessage(
    `${pnlEmoji} <b>Daily Summary</b>\n` +
    `Equity: $${summary.equity.toFixed(2)}\n` +
    `Daily P&L: $${summary.dailyPnl.toFixed(2)}\n` +
    `Drawdown: ${summary.drawdown.toFixed(2)}%\n` +
    `Open Positions: ${summary.openPositions}\n` +
    `Trades Today: ${summary.tradestoday}`
  )
}

export async function alertWeeklyReview(review: {
  sharpeRatio: number
  recommendations: string[]
  strategyPauses: string[]
}): Promise<boolean> {
  return sendMessage(
    `📋 <b>Weekly Review</b>\n` +
    `Sharpe: ${review.sharpeRatio.toFixed(3)}\n` +
    `Recommendations:\n${review.recommendations.map(r => `• ${r}`).join('\n')}\n` +
    (review.strategyPauses.length > 0
      ? `⚠️ Paused: ${review.strategyPauses.join(', ')}`
      : '✅ All strategies active')
  )
}

export async function alertEvolution(agent: string, outcome: string): Promise<boolean> {
  return sendMessage(
    `🧬 <b>Prompt Evolution</b>\n` +
    `Agent: ${agent}\n` +
    `Outcome: ${outcome}`
  )
}

export async function alertCustom(title: string, body: string): Promise<boolean> {
  return sendMessage(`<b>${title}</b>\n${body}`)
}
