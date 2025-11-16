import { CheckCircle, Clock, XCircle, FileText, AlertCircle, HelpCircle } from 'lucide-react'
import { t } from '@/i18n'

type StatusBadgeVariant = {
  icon: typeof CheckCircle
  classes: string
  labelKey?: string
  label?: string
  fallbackLabel: string
}

export type StatusBadgeProps = {
  status?: string | null
  variantMap?: Record<string, StatusBadgeVariant>
  size?: 'sm' | 'md'
  className?: string
  formatLabel?: (status: string) => string
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  paid: {
    icon: CheckCircle,
    classes: 'bg-success-50 text-success-700 border-success-200',
    labelKey: 'billing.status.paid',
    fallbackLabel: 'Paid',
  },
  open: {
    icon: Clock,
    classes: 'bg-primary-50 text-primary-700 border-primary-200',
    labelKey: 'billing.status.open',
    fallbackLabel: 'Open',
  },
  draft: {
    icon: FileText,
    classes: 'bg-warning-50 text-warning-700 border-warning-200',
    labelKey: 'billing.status.draft',
    fallbackLabel: 'Draft',
  },
  void: {
    icon: XCircle,
    classes: 'bg-gray-100 text-gray-700 border-gray-200',
    labelKey: 'billing.status.void',
    fallbackLabel: 'Void',
  },
  uncollectible: {
    icon: AlertCircle,
    classes: 'bg-danger-50 text-danger-700 border-danger-200',
    labelKey: 'billing.status.uncollectible',
    fallbackLabel: 'Uncollectible',
  },
}

const humanize = (value: string) =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const resolveStatusLabel = (
  variant: StatusBadgeVariant | undefined,
  status: string,
  formatLabel?: (status: string) => string,
) => {
  if (variant?.label) return variant.label
  if (formatLabel) return formatLabel(status)
  if (variant?.labelKey) {
    const translated = t(variant.labelKey)
    if (translated !== variant.labelKey) {
      return translated
    }
  }
  if (variant?.fallbackLabel) return variant.fallbackLabel
  return humanize(status || 'unknown')
}

export function StatusBadge({
  status,
  variantMap,
  size = 'sm',
  className,
  formatLabel,
}: StatusBadgeProps) {
  const normalizedStatus = (status || 'unknown').toLowerCase()
  const variant = variantMap?.[normalizedStatus] ?? STATUS_VARIANTS[normalizedStatus]
  const Icon = (variant?.icon ?? HelpCircle) as typeof CheckCircle
  const resolvedLabel = resolveStatusLabel(variant, normalizedStatus, formatLabel)
  const padding = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const baseClasses = variant?.classes ?? 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded font-medium ${padding} ${baseClasses} ${className || ''}`}
      aria-label={resolvedLabel}
    >
      <Icon className={iconSize} aria-hidden={true} />
      <span>{resolvedLabel}</span>
    </span>
  )
}

export default StatusBadge
