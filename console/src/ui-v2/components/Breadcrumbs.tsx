"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function labelFor(segment: string): string {
  switch (segment) {
    case 'billing':
      return 'Billing'
    case 'usage':
      return 'Usage'
    case 'invoices':
      return 'Invoices'
    case 'settings':
      return 'Settings'
    case 'transparency':
      return 'Transparency'
    case 'auctions':
      return 'Auctions'
    case 'admin':
      return 'Admin'
    case 'health':
      return 'Health'
    case 'dashboard':
      return 'Dashboard'
    default:
      // slugs or IDs
      if (/^[0-9a-fA-F-]{6,}$/.test(segment)) return segment.slice(0, 8)
      return capitalize(segment.replace(/-/g, ' '))
  }
}

export function Breadcrumbs() {
  const pathname = usePathname() || '/'
  const parts = pathname.split('/').filter(Boolean)

  const items = [{ href: '/', label: 'Home' }].concat(
    parts.map((seg, idx) => {
      const href = '/' + parts.slice(0, idx + 1).join('/')
      return { href, label: labelFor(seg) }
    })
  )

  return (
    <nav className="mb-4" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-400">/</span>}
              {isLast ? (
                <span aria-current="page" className="font-medium text-zinc-900 dark:text-zinc-100">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-zinc-900 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] dark:hover:text-zinc-100 rounded px-1 -mx-1"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default Breadcrumbs
