'use client'

import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/utils'

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
}

interface DateFormattedChartProps extends ChartProps {
  formatDateLabel?: (value: string) => string
  formatTooltipLabel?: (value: string) => string
}

// Revenue Line Chart
export function RevenueLineChart({ data, height = 300 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatCurrency(value, 'USD').replace('$', '')}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
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
export function RevenueAreaChart({ data, height = 300, formatDateLabel, formatTooltipLabel }: DateFormattedChartProps) {
  const axisFormatter = (value: string | number) =>
    formatDateLabel
      ? formatDateLabel(String(value))
      : new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const tooltipLabelFormatter = (label: string) =>
    formatTooltipLabel ? formatTooltipLabel(label) : new Date(label).toLocaleDateString()

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
          tickFormatter={(value) => axisFormatter(value)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatCurrency(value, 'USD').replace('$', '')}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => tooltipLabelFormatter(String(label))}
          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
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
export function ImpressionsBarChart({ data, height = 300 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatNumber(value)}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          formatter={(value: number) => [formatNumber(value), 'Impressions']}
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
export function EcpmLineChart({ data, height = 300, formatDateLabel, formatTooltipLabel }: DateFormattedChartProps) {
  const axisFormatter = (value: string | number) =>
    formatDateLabel
      ? formatDateLabel(String(value))
      : new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const tooltipLabelFormatter = (label: string) =>
    formatTooltipLabel ? formatTooltipLabel(label) : new Date(label).toLocaleDateString()

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => axisFormatter(value)}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => `$${value.toFixed(2)}`}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => tooltipLabelFormatter(String(label))}
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'eCPM']}
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
export function FillRateLineChart({ data, height = 300 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          domain={[0, 1]}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Fill Rate']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="fillRate" 
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
export function CombinedMetricsChart({ data, height = 300 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis 
          yAxisId="left"
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatCurrency(value, 'USD').replace('$', '')}
        />
        <YAxis 
          yAxisId="right"
          orientation="right"
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => formatNumber(value)}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
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
