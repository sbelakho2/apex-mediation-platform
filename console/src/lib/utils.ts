import { type ClassValue, clsx } from 'clsx'

const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en-US'

let cachedLocale: string | undefined

export const getLocale = (): string => {
  if (cachedLocale) {
    return cachedLocale
  }

  let detectedLocale: string | undefined

  if (typeof navigator !== 'undefined') {
    detectedLocale = navigator.language || (Array.isArray(navigator.languages) && navigator.languages[0]) || undefined
  } else if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale
  }

  cachedLocale = detectedLocale ?? DEFAULT_LOCALE
  return cachedLocale
}

const sanitizeNumberInput = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback)

const parseDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

type FormatNumberOptions = Intl.NumberFormatOptions & {
  compactThreshold?: number
}

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number, currency: string = 'USD', options?: Intl.NumberFormatOptions): string {
  const safeAmount = sanitizeNumberInput(amount)
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
    style: 'currency',
    currency,
  }).format(safeAmount)
}

export function formatNumber(value: number, options?: FormatNumberOptions): string {
  const safeValue = sanitizeNumberInput(value)
  const { compactThreshold = 1000, ...intlOptions } = options ?? {}
  const shouldCompact = !options?.notation && Math.abs(safeValue) >= compactThreshold

  const formatOptions: Intl.NumberFormatOptions = shouldCompact
    ? { notation: 'compact', maximumFractionDigits: 1, ...intlOptions }
    : { ...intlOptions }

  return new Intl.NumberFormat(getLocale(), formatOptions).format(safeValue)
}

export function formatPercentage(value: number, decimals: number = 2, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) {
    return '0%'
  }

  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    style: 'percent',
    ...options,
  }).format(value)
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const parsedDate = parseDate(date)
  if (!parsedDate) return '—'

  return new Intl.DateTimeFormat(
    getLocale(),
    options ?? {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }
  ).format(parsedDate)
}

export function formatDateTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const parsedDate = parseDate(date)
  if (!parsedDate) return '—'

  return new Intl.DateTimeFormat(
    getLocale(),
    options ?? {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(parsedDate)
}

export function calculateEcpm(revenue: number, impressions: number): number {
  if (impressions === 0) return 0
  return (revenue / impressions) * 1000
}

export function calculateFillRate(impressions: number, requests: number): number {
  if (requests === 0) return 0
  return impressions / requests
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'success',
    inactive: 'danger',
    pending: 'warning',
    suspended: 'danger',
    paused: 'warning',
    completed: 'success',
    failed: 'danger',
    processing: 'info',
  }
  return colors[status.toLowerCase()] || 'info'
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: 'info',
    medium: 'warning',
    high: 'danger',
    critical: 'danger',
  }
  return colors[severity.toLowerCase()] || 'info'
}
