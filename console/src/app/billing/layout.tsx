'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, FileText, TrendingUp, Settings } from 'lucide-react'

const billingNav = [
  { name: 'Usage', href: '/billing/usage', icon: TrendingUp },
  { name: 'Invoices', href: '/billing/invoices', icon: FileText },
  { name: 'Settings', href: '/billing/settings', icon: Settings },
]

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      {/* Billing Sub-Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-8 py-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Billing</h2>
                  <p className="text-xs text-gray-600">Manage usage and invoices</p>
                </div>
              </div>
              <nav className="flex-1 flex items-center gap-1 ml-8">
                {billingNav.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition
                        ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }
                      `}
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  )
}
