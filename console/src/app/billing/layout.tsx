'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CreditCard, FileText, TrendingUp, Settings } from 'lucide-react'
import { useSession } from '@/lib/useSession'
import { useFeatures } from '@/lib/useFeatures'
import {
  BILLING_ALLOWED_PERMISSIONS,
  BILLING_ALLOWED_ROLES,
  BILLING_FEATURE_FALLBACK,
  canAccessBilling as canUserAccessBilling,
} from './access'

type BillingNavItem = {
  name: string
  href: string
  icon: typeof TrendingUp
  featureFlag?: keyof NonNullable<ReturnType<typeof useFeatures>['features']>
  permission?: string
}

const BILLING_NAV: BillingNavItem[] = [
  { name: 'Usage', href: '/billing/usage', icon: TrendingUp },
  { name: 'Invoices', href: '/billing/invoices', icon: FileText },
  { name: 'Settings', href: '/billing/settings', icon: Settings },
]


export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading: sessionLoading } = useSession()
  const { features, loading: featureLoading } = useFeatures({ fallback: BILLING_FEATURE_FALLBACK })

  const hasBillingFeature = features?.billing ?? BILLING_FEATURE_FALLBACK.billing ?? false
  const canAccessBilling = canUserAccessBilling(user)

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace('/login')
    }
  }, [sessionLoading, user, router])

  useEffect(() => {
    if (sessionLoading || featureLoading) return
    if (!hasBillingFeature || !canAccessBilling) {
      router.replace('/403')
    }
  }, [sessionLoading, featureLoading, hasBillingFeature, canAccessBilling, router])

  const navItems = useMemo(() => {
    if (!hasBillingFeature || !canAccessBilling) return []
    return BILLING_NAV.filter((item) => {
      if (item.featureFlag && features && features[item.featureFlag] === false) {
        return false
      }
      if (item.permission && !(user?.permissions ?? []).includes(item.permission)) {
        return false
      }
      return true
    })
  }, [canAccessBilling, features, hasBillingFeature, user?.permissions])

  if (sessionLoading || featureLoading) {
    return (
      <div className="bg-white border rounded-lg p-6 text-gray-700" role="status">
        Loading billing workspace…
      </div>
    )
  }

  if (!hasBillingFeature) {
    return (
      <div className="bg-white border rounded-lg p-6 text-gray-700" role="alert">
        Billing is disabled for this environment. Contact support if you believe this is an error.
      </div>
    )
  }

  if (!canAccessBilling) {
    return (
      <div className="bg-white border rounded-lg p-6 text-gray-700" role="alert">
        You do not have permission to manage billing. Redirecting…
      </div>
    )
  }

  return (
    <div>
      {/* Billing Sub-Navigation */}
      <div className="border-b border-gray-200 bg-white" role="navigation" aria-label="Billing sections">
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
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
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
                {navItems.length === 0 && (
                  <p className="text-xs text-gray-500" role="status">
                    No billing tools are enabled for your account yet.
                  </p>
                )}
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
