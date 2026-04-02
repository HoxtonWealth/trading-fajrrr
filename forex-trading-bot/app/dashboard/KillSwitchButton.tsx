'use client'

import { useState } from 'react'

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
    <div style={{
      padding: '16px',
      background: isActive ? '#fee' : '#efe',
      border: `2px solid ${isActive ? '#c00' : '#0a0'}`,
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    }}>
      <div>
        <strong style={{ fontSize: '1.1rem' }}>
          Kill Switch: {isActive ? 'ACTIVE (Trading Halted)' : 'Inactive (Trading Normal)'}
        </strong>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        style={{
          padding: '8px 20px',
          background: isActive ? '#0a0' : '#c00',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 'bold',
          fontSize: '0.95rem',
        }}
      >
        {loading ? '...' : isActive ? 'Resume Trading' : 'HALT TRADING'}
      </button>
    </div>
  )
}
