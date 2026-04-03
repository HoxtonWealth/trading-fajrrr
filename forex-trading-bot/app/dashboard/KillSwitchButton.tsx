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
    <button
      onClick={toggle}
      disabled={loading}
      className={`w-full font-sans text-[12px] font-semibold py-2 px-3 rounded-lg border transition-colors cursor-pointer ${
        isActive
          ? 'bg-green-bg border-green text-green hover:bg-green/10'
          : 'bg-red-bg border-red text-red hover:bg-red/10'
      } ${loading ? 'opacity-50 cursor-wait' : ''}`}
    >
      {loading ? '...' : isActive ? 'Resume Trading' : 'Halt Trading'}
    </button>
  )
}
