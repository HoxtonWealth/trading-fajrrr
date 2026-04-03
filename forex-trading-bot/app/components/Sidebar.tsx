'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{ width: 52 }} className="fixed left-0 top-0 bottom-0 bg-bg-surface border-r border-border/50 flex flex-col items-center pt-3 z-50">
      {/* Logo */}
      <div style={{ width: 22, height: 22, borderRadius: 10 }} className="bg-green flex items-center justify-center mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-3 h-3">
          <polyline points="4 16 8 12 12 14 20 6" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                isActive
                  ? 'bg-green-bg text-green'
                  : 'text-text-muted hover:bg-bg-warm'
              }`}
            >
              {item.icon}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
