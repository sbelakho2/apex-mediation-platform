'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href: string
}

export interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const pathname = usePathname()

  // Auto-generate breadcrumbs from pathname if not provided
  const breadcrumbs = items || generateBreadcrumbsFromPath(pathname)

  if (breadcrumbs.length === 0) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center space-x-2 text-sm ${className}`}>
      <Link
        href="/"
        className="text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1

        return (
          <div key={item.href} className="flex items-center space-x-2">
            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {isLast ? (
              <span className="font-medium text-gray-900" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                {item.label}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/**
 * Generate breadcrumbs from pathname
 * Examples:
 *   /billing/usage -> [{ label: 'Billing', href: '/billing' }, { label: 'Usage', href: '/billing/usage' }]
 *   /billing/invoices/123 -> [{ label: 'Billing', href: '/billing' }, { label: 'Invoices', href: '/billing/invoices' }, { label: 'Invoice #123', href: '/billing/invoices/123' }]
 */
function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  if (!pathname || pathname === '/') {
    return []
  }

  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs: BreadcrumbItem[] = []

  let currentPath = ''
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    currentPath += `/${segment}`

    // Capitalize and format label
    let label = segment.charAt(0).toUpperCase() + segment.slice(1)

    // Special cases
    if (label === 'Invoices' && i === segments.length - 1 && segments[i - 1] === 'billing') {
      // Don't add if this is the invoices list page (will be added as "Invoices")
    } else if (i === segments.length - 1 && segments[i - 1] === 'invoices' && /^[a-zA-Z0-9-]+$/.test(segment)) {
      // This is an invoice ID
      label = `Invoice #${segment.substring(0, 8)}`
    }

    breadcrumbs.push({
      label,
      href: currentPath,
    })
  }

  return breadcrumbs
}
