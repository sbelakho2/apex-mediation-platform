'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const FALLBACK_LOCALE = 'en-US'
const FALLBACK_CURRENCY = 'USD'
const FALLBACK_TIMEZONE = 'UTC'
const ENV_DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY

const sanitizeNumber = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback)

const parseDateValue = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateValue = (value: string | number | Date, formatter: Intl.DateTimeFormat) => {
  const parsed = parseDateValue(value)
  return parsed ? formatter.format(parsed) : ''
}

const createCurrencyFormatter = (locale: string, currency: string, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  })

const createNumberFormatter = (locale: string, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(locale, options)

const getBrowserLocale = () => {
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      return navigator.languages[0]
    }
    if (navigator.language) {
      return navigator.language
    }
  }
  return FALLBACK_LOCALE
}

const getBrowserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE
  } catch {
    return FALLBACK_TIMEZONE
  }
}

const getBrowserCurrency = () => {
  if (ENV_DEFAULT_CURRENCY) {
    return ENV_DEFAULT_CURRENCY
  }
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: FALLBACK_CURRENCY,
    })
    return formatter.resolvedOptions().currency || FALLBACK_CURRENCY
  } catch {
    return FALLBACK_CURRENCY
  }
}

const useChartEnvironment = (locale?: string, currency?: string, timeZone?: string) => {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  return {
    locale: locale || getBrowserLocale(),
    currency: currency || getBrowserCurrency(),
    timeZone: timeZone || getBrowserTimeZone(),
    isClient,
  }
}

const ChartSkeleton = ({ height }: { height: number }) => (
  <div
    className="w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 animate-pulse"
    style={{ height }}
    data-testid="chart-skeleton"
  />
)

const useNormalizedFillRateData = (data: RevenueData[]) =>
  useMemo(() => {
    const values = data.map((point) => sanitizeNumber(point.fillRate))
    const requiresPercentNormalization = values.some((value) => value > 1.5)

    return data.map((point) => ({
      ...point,
      normalizedFillRate: requiresPercentNormalization
        ? sanitizeNumber(point.fillRate) / 100
        : sanitizeNumber(point.fillRate),
    }))
  }, [data])

interface RevenueData {
  date: string
  revenue: number
  impressions: number
  clicks: number
  ecpm: number
  fillRate: number
}

interface ChartProps {
  data: RevenueData[]
  height?: number
  locale?: string
  currency?: string
  timeZone?: string
}

interface DateFormattedChartProps extends ChartProps {
  formatDateLabel?: (value: string) => string
  formatTooltipLabel?: (value: string) => string
}

// Revenue Line Chart
export function RevenueLineChart({
  data,
  height = 300,
  locale,
  currency,
  timeZone,
}: ChartProps) {
  const {
    locale: resolvedLocale,
    currency: resolvedCurrency,
    timeZone: resolvedTimeZone,
    isClient,
  } = useChartEnvironment(locale, currency, timeZone)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })
  const currencyFormatter = createCurrencyFormatter(resolvedLocale, resolvedCurrency)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatDateValue(value, axisDateFormatter)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => currencyFormatter.format(sanitizeNumber(value))}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateValue(label, tooltipDateFormatter)}
          formatter={(value: number) => [currencyFormatter.format(sanitizeNumber(value)), 'Revenue']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="revenue" 
          stroke="#0ea5e9" 
          strokeWidth={2}
          dot={{ fill: '#0ea5e9', r: 4 }}
          activeDot={{ r: 6 }}
          name="Revenue"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Revenue Area Chart
export function RevenueAreaChart({
  data,
  height = 300,
  formatDateLabel,
  formatTooltipLabel,
  currency,
  locale,
  timeZone,
}: DateFormattedChartProps) {
  const {
    locale: resolvedLocale,
    currency: resolvedCurrency,
    timeZone: resolvedTimeZone,
    isClient,
  } = useChartEnvironment(locale, currency, timeZone)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })

  const resolvedAxisFormatter = formatDateLabel
    ? (value: string | number) => formatDateLabel(String(value))
    : (value: string | number) => formatDateValue(value, axisDateFormatter)

  const resolvedTooltipFormatter = formatTooltipLabel
    ? (label: string) => formatTooltipLabel(label)
    : (label: string) => formatDateValue(label, tooltipDateFormatter)

  const currencyFormatter = createCurrencyFormatter(resolvedLocale, resolvedCurrency)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => resolvedAxisFormatter(value)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => currencyFormatter.format(sanitizeNumber(value))}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => resolvedTooltipFormatter(String(label))}
          formatter={(value: number) => [currencyFormatter.format(sanitizeNumber(value)), 'Revenue']}
        />
        <Area 
          type="monotone" 
          dataKey="revenue" 
          stroke="#0ea5e9" 
          strokeWidth={2}
          fillOpacity={1} 
          fill="url(#colorRevenue)"
          name="Revenue"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Impressions Bar Chart
export function ImpressionsBarChart({
  data,
  height = 300,
  locale,
  timeZone,
}: ChartProps) {
  const { locale: resolvedLocale, timeZone: resolvedTimeZone, isClient } = useChartEnvironment(locale, undefined, timeZone)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })
  const numberFormatter = createNumberFormatter(resolvedLocale, { maximumFractionDigits: 0 })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatDateValue(value, axisDateFormatter)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => numberFormatter.format(sanitizeNumber(value))}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateValue(label, tooltipDateFormatter)}
          formatter={(value: number) => [numberFormatter.format(sanitizeNumber(value)), 'Impressions']}
        />
        <Legend />
        <Bar 
          dataKey="impressions" 
          fill="#22c55e" 
          radius={[4, 4, 0, 0]}
          name="Impressions"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// eCPM Line Chart
export function EcpmLineChart({
  data,
  height = 300,
  formatDateLabel,
  formatTooltipLabel,
  locale,
  currency,
  timeZone,
}: DateFormattedChartProps) {
  const {
    locale: resolvedLocale,
    currency: resolvedCurrency,
    timeZone: resolvedTimeZone,
    isClient,
  } = useChartEnvironment(locale, currency, timeZone)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })

  const resolvedAxisFormatter = formatDateLabel
    ? (value: string | number) => formatDateLabel(String(value))
    : (value: string | number) => formatDateValue(value, axisDateFormatter)

  const resolvedTooltipFormatter = formatTooltipLabel
    ? (label: string) => formatTooltipLabel(label)
    : (label: string) => formatDateValue(label, tooltipDateFormatter)

  const currencyFormatter = createCurrencyFormatter(resolvedLocale, resolvedCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => resolvedAxisFormatter(value)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => currencyFormatter.format(sanitizeNumber(value))}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => resolvedTooltipFormatter(String(label))}
          formatter={(value: number) => [currencyFormatter.format(sanitizeNumber(value)), 'eCPM']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="ecpm" 
          stroke="#f59e0b" 
          strokeWidth={2}
          dot={{ fill: '#f59e0b', r: 4 }}
          activeDot={{ r: 6 }}
          name="eCPM"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Fill Rate Line Chart
export function FillRateLineChart({
  data,
  height = 300,
  locale,
  timeZone,
}: ChartProps) {
  const { locale: resolvedLocale, timeZone: resolvedTimeZone, isClient } = useChartEnvironment(locale, undefined, timeZone)
  const normalizedData = useNormalizedFillRateData(data)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })
  const percentFormatter = createNumberFormatter(resolvedLocale, {
    style: 'percent',
    maximumFractionDigits: 0,
  })
  const percentTooltipFormatter = createNumberFormatter(resolvedLocale, {
    style: 'percent',
    maximumFractionDigits: 2,
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={normalizedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatDateValue(value, axisDateFormatter)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => percentFormatter.format(sanitizeNumber(value))}
          domain={[0, 1]}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateValue(label, tooltipDateFormatter)}
          formatter={(value: number) => [percentTooltipFormatter.format(sanitizeNumber(value)), 'Fill Rate']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="normalizedFillRate" 
          stroke="#8b5cf6" 
          strokeWidth={2}
          dot={{ fill: '#8b5cf6', r: 4 }}
          activeDot={{ r: 6 }}
          name="Fill Rate"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Combined Metrics Chart (Revenue + Impressions)
export function CombinedMetricsChart({
  data,
  height = 300,
  locale,
  currency,
  timeZone,
}: ChartProps) {
  const {
    locale: resolvedLocale,
    currency: resolvedCurrency,
    timeZone: resolvedTimeZone,
    isClient,
  } = useChartEnvironment(locale, currency, timeZone)

  if (!isClient) {
    return <ChartSkeleton height={height} />
  }

  const axisDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: resolvedTimeZone,
  })
  const tooltipDateFormatter = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: 'medium',
    timeZone: resolvedTimeZone,
  })
  const currencyFormatter = createCurrencyFormatter(resolvedLocale, resolvedCurrency)
  const numberFormatter = createNumberFormatter(resolvedLocale)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatDateValue(value, axisDateFormatter)}
        />
        <YAxis 
          yAxisId="left"
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => currencyFormatter.format(sanitizeNumber(value))}
        />
        <YAxis 
          yAxisId="right"
          orientation="right"
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => numberFormatter.format(sanitizeNumber(value))}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateValue(label, tooltipDateFormatter)}
        />
        <Legend />
        <Line 
          yAxisId="left"
          type="monotone" 
          dataKey="revenue" 
          stroke="#0ea5e9" 
          strokeWidth={2}
          dot={{ fill: '#0ea5e9', r: 4 }}
          name="Revenue"
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="impressions" 
          stroke="#22c55e" 
          strokeWidth={2}
          dot={{ fill: '#22c55e', r: 4 }}
          name="Impressions"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
