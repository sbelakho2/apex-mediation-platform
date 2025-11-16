'use client'

import Link from 'next/link'
import { usePathname, useSelectedLayoutSegments } from 'next/navigation'
import { useAdminGate } from '@/lib/useAdminGate'

const ADMIN_NAV = [
  { name: 'Health', href: '/admin/health', segment: 'health' },
  { name: 'Billing Ops', href: '/admin/billing', segment: 'billing' },
  { name: 'Audit Log', href: '/admin/audit', segment: 'audit' },
  { name: 'Sales Automation', href: '/admin/sales-automation', segment: 'sales-automation' },
  { name: 'Value Multipliers', href: '/admin/value-multipliers', segment: 'value-multipliers' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useAdminGate()
  const pathname = usePathname()
  const segments = useSelectedLayoutSegments()
  const currentSegment = segments[0] ?? (pathname === '/admin' ? 'health' : undefined)

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin</h1>
          <p className="text-gray-600 mt-2">Operator controls & readouts</p>
        </div>

        <div className="bg-white border rounded-lg p-2">
          <nav className="flex gap-2" aria-label="Admin navigation">
            {ADMIN_NAV.map((tab) => {
              const active = currentSegment === tab.segment
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${active ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div>{children}</div>
      </div>
    </div>
  )
}
