'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefreshButton() {
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch('/api/markets/refresh')
      router.refresh()
    } catch (e) {
      console.error('Refresh failed:', e)
    }
    setRefreshing(false)
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      style={{
        padding: '8px 20px',
        background: refreshing ? '#ccc' : '#4a9',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: refreshing ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
      }}
    >
      {refreshing ? 'Refreshing…' : 'Refresh Data'}
    </button>
  )
}
