import React from 'react'
import { t } from '@/i18n'

type KnownInvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export type InvoiceStatusFilter = 'all' | KnownInvoiceStatus | (string & {})

type StatusOption = {
  value: InvoiceStatusFilter
  label?: string
  labelKey?: string
  fallback?: string
}

type Props = {
  status: InvoiceStatusFilter
  onStatusChange: (s: InvoiceStatusFilter) => void
  className?: string
  label?: string
  statusOptions?: StatusOption[]
}

const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', labelKey: 'billing.filters.status.all', fallback: 'All statuses' },
  { value: 'open', labelKey: 'billing.filters.status.open', fallback: 'Open' },
  { value: 'paid', labelKey: 'billing.filters.status.paid', fallback: 'Paid' },
  { value: 'void', labelKey: 'billing.filters.status.void', fallback: 'Void' },
  { value: 'uncollectible', labelKey: 'billing.filters.status.uncollectible', fallback: 'Uncollectible' },
  { value: 'draft', labelKey: 'billing.filters.status.draft', fallback: 'Draft' },
]

const humanizeStatus = (value: string) =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const translate = (key: string, fallback: string) => {
  const result = t(key)
  return result === key ? fallback : result
}

const resolveLabel = (option: StatusOption) => {
  if (option.label) return option.label
  if (option.labelKey) {
    const translated = t(option.labelKey)
    if (translated !== option.labelKey) {
      return translated
    }
  }
  if (option.fallback) return option.fallback
  return option.value === 'all' ? 'All statuses' : humanizeStatus(option.value)
}

export default function Filters({
  status,
  onStatusChange,
  className,
  label,
  statusOptions,
}: Props) {
  const resolvedOptions = statusOptions?.length ? statusOptions : DEFAULT_STATUS_OPTIONS
  const resolvedLabel = label || translate('billing.filters.statusLabel', 'Status')

  return (
    <div className={`flex items-center gap-3 ${className || ''}`}>
      <label htmlFor="status" className="text-sm text-gray-700">
        {resolvedLabel}
      </label>
      <select
        id="status"
        value={status}
        onChange={(e) => onStatusChange(e.target.value as InvoiceStatusFilter)}
        className="text-sm border rounded px-2 py-1"
        aria-label={translate('billing.filters.statusAriaLabel', 'Filter by invoice status')}
      >
        {resolvedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {resolveLabel(option)}
          </option>
        ))}
      </select>
    </div>
  )
}
