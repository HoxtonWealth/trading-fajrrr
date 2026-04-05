'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 20, height: 20 }}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/markets',
    label: 'Markets',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 20, height: 20 }}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: 52,
        borderRight: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-surface)',
      }}
      className="fixed left-0 top-0 bottom-0 flex flex-col items-center z-50"
      >
      {/* Logo */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          backgroundColor: 'var(--color-green)',
          marginTop: 14,
          marginBottom: 14,
        }}
        className="flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 12, height: 12 }}>
          <polyline points="4 16 8 12 12 14 20 6" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center" style={{ gap: 4 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s ease',
                backgroundColor: isActive ? 'var(--color-green-bg)' : 'transparent',
                color: isActive ? 'var(--color-green)' : 'var(--color-text-muted)',
              }}
            >
              {item.icon}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
