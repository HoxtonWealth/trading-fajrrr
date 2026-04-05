'use client'

import { useState } from 'react'

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif"

export function KillSwitchButton({ initialState }: { initialState: string }) {
  const [state, setState] = useState(initialState)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/kill-switch', { method: 'POST' })
      const data = await res.json()
      if (data.state) setState(data.state)
    } catch {
      // Silently fail — dashboard is informational
    } finally {
      setLoading(false)
    }
  }

  const isActive = state === 'active'

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        width: '100%',
        fontFamily: FONT_SANS,
        fontSize: 13,
        fontWeight: 600,
        padding: '10px 16px',
        borderRadius: 8,
        border: `1.5px solid ${isActive ? 'var(--color-green)' : 'var(--color-red)'}`,
        backgroundColor: isActive ? 'var(--color-green-bg)' : 'var(--color-red-bg)',
        color: isActive ? 'var(--color-green)' : 'var(--color-red)',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.5 : 1,
        transition: 'all 0.15s ease',
        letterSpacing: 0.3,
      }}
    >
      {loading ? '...' : isActive ? 'Resume Trading' : 'Halt Trading'}
    </button>
  )
}
