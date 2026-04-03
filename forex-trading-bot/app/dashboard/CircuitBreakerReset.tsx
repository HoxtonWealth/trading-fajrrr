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
      <div style={{
        padding: '16px',
        background: '#efe',
        border: '2px solid #0a0',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}>
        <strong>Circuit breaker reset.</strong> Drawdown baseline will recalculate on next equity snapshot (~5 min).
      </div>
    )
  }

  if (!isTriggered) return null

  return (
    <div style={{
      padding: '16px',
      background: '#fff3f3',
      border: '2px solid #c00',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    }}>
      <div>
        <strong style={{ fontSize: '1.1rem', color: '#c00' }}>
          Circuit Breaker ACTIVE — Drawdown {currentDrawdown.toFixed(1)}% exceeds 30% limit
        </strong>
        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
          Pipeline halted. Close losing positions on Capital.com, then reset to resume.
        </div>
      </div>
      <button
        onClick={reset}
        disabled={loading}
        style={{
          padding: '8px 20px',
          background: '#0a0',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 'bold',
          fontSize: '0.95rem',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '...' : 'Reset & Resume'}
      </button>
    </div>
  )
}
