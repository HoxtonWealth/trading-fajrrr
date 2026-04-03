'use client'

import { useState } from 'react'

export function CircuitBreakerReset({ currentDrawdown }: { currentDrawdown: number }) {
  const [loading, setLoading] = useState(false)
  const [resetAt, setResetAt] = useState<string | null>(null)

  const isTriggered = currentDrawdown >= 30

  const reset = async () => {
    if (!confirm('Reset drawdown baseline? This acknowledges the current loss and lets the bot resume trading.')) return
    setLoading(true)
    try {
      const res = await fetch('/api/circuit-breaker', { method: 'POST' })
      const data = await res.json()
      if (data.resetAt) setResetAt(data.resetAt)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  if (resetAt) {
    return (
      <div className="bg-green-bg border border-green rounded-lg p-4 text-[13px] font-sans text-green">
        <strong>Circuit breaker reset.</strong> Drawdown baseline will recalculate on next equity snapshot (~5 min).
      </div>
    )
  }

  if (!isTriggered) return null

  return (
    <div className="bg-red-bg border border-red rounded-lg p-4 flex items-center justify-between">
      <div>
        <div className="font-sans text-[14px] font-semibold text-red">
          Circuit Breaker ACTIVE — Drawdown {currentDrawdown.toFixed(1)}% exceeds 30% limit
        </div>
        <div className="font-sans text-[12px] text-text-muted mt-1">
          Pipeline halted. Close losing positions on Capital.com, then reset to resume.
        </div>
      </div>
      <button
        onClick={reset}
        disabled={loading}
        className={`font-sans text-[12px] font-semibold py-2 px-4 rounded-lg bg-green text-white hover:bg-green/90 shrink-0 ml-4 cursor-pointer ${
          loading ? 'opacity-50 cursor-wait' : ''
        }`}
      >
        {loading ? '...' : 'Reset & Resume'}
      </button>
    </div>
  )
}
