import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(0)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatNumber(num: number): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0'
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toString()
}

export function formatPercentage(value: number, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%'
  }
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
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
