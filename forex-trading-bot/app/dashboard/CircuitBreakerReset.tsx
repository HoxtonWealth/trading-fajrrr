'use client'

import { useState } from 'react'

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif"

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
      <div
        style={{
          backgroundColor: 'var(--color-green-bg)',
          border: '1px solid var(--color-green)',
          borderRadius: 10,
          padding: 16,
          fontFamily: FONT_SANS,
          fontSize: 13,
          color: 'var(--color-green)',
        }}
      >
        <strong>Circuit breaker reset.</strong> Drawdown baseline will recalculate on next equity snapshot (~5 min).
      </div>
    )
  }

  if (!isTriggered) return null

  return (
    <div
      className="flex items-center justify-between"
      style={{
        backgroundColor: 'var(--color-red-bg)',
        border: '1px solid var(--color-red)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 600, color: 'var(--color-red)' }}>
          Circuit Breaker ACTIVE — Drawdown {currentDrawdown.toFixed(1)}% exceeds 30% limit
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Pipeline halted. Close losing positions on Capital.com, then reset to resume.
        </div>
      </div>
      <button
        onClick={reset}
        disabled={loading}
        style={{
          fontFamily: FONT_SANS,
          fontSize: 13,
          fontWeight: 600,
          padding: '10px 18px',
          borderRadius: 8,
          backgroundColor: 'var(--color-green)',
          color: '#ffffff',
          border: 'none',
          flexShrink: 0,
          marginLeft: 16,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.5 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        {loading ? '...' : 'Reset & Resume'}
      </button>
    </div>
  )
}
