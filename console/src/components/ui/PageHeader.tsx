import React from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: string
  kicker?: string
  actions?: React.ReactNode
  className?: string
}

/**
 * Unifies page headers (kicker + H1 + subtitle + actions) across Console.
 */
export default function PageHeader({ title, subtitle, kicker, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`bg-white border-b ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            {kicker && <p className="text-sm font-medium text-primary-600">{kicker}</p>}
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </header>
  )
}
