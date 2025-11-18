'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Analytics Page"
// Analytics dashboard wired to live APIs with accessible charts and resilient states

import {
  ArrowPathIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Range = 'today' | 'week' | 'month'

type AnalyticsOverview = {
  revenue: {
    today: number;
    yesterday: number;
    thisMonth: number;
    lastMonth: number;
    lifetime: number;
  };
  impressions: number;
  clicks: number;
  ecpm: number;
  ctr: number;
};

      setLoading(false);
    })().catch((e) => {
      if (!alive) return;
      setError(e?.message || 'Network error');
      setLoading(false);
    });
    return () => {
      alive = false;
      controller?.abort();
    };
  }, [timeRange]);

  const totals = useMemo(() => {
    return series.reduce(
      (acc, point) => {
        acc.revenue += Math.max(0, point.revenue || 0);
        acc.impressions += Math.max(0, point.impressions || 0);
        acc.clicks += Math.max(0, point.clicks || 0);
        return acc;
      },
      { revenue: 0, impressions: 0, clicks: 0 }
    );
  }, [series]);

  const funnel = useMemo(() => {
    const values = [totals.impressions, totals.clicks, totals.revenue];
    const maxValue = Math.max(...values, 1);
    return [
      { label: 'Impressions', value: totals.impressions, percent: Math.round((totals.impressions / maxValue) * 100) },
      { label: 'Clicks', value: totals.clicks, percent: Math.round((totals.clicks / maxValue) * 100) },
      { label: 'Revenue', value: totals.revenue, percent: Math.round((totals.revenue / maxValue) * 100) },
    ];
  }, [totals]);

  const ctrValue = Math.max(0, (overview?.ctr ?? 0) / 100);
  const impressionsPerMinute = totals.impressions / 60;

  const metricCards = overview
    ? [
        {
          title: 'Revenue (Today)',
          value: currencyFmt.format(Math.max(0, overview.revenue.today)),
          change: percentDelta(overview.revenue.today, overview.revenue.yesterday),
          icon: CurrencyDollarIcon,
          trend: [45, 52, 48, 61, 58, 67, 72],
        },
        {
          title: 'Revenue (This Month)',
          value: currencyFmt.format(Math.max(0, overview.revenue.thisMonth)),
          change: percentDelta(overview.revenue.thisMonth, overview.revenue.lastMonth),
          icon: ArrowPathIcon,
          trend: [62, 58, 65, 63, 70, 68, 72],
        },
        {
          title: 'Lifetime Revenue',
          value: currencyFmt.format(Math.max(0, overview.revenue.lifetime)),
          {loading ? (
            <div className="h-64 animate-pulse bg-white/30 rounded" aria-hidden="true" />
          ) : series.length === 0 ? (
        },
        {
          title: 'Impressions',
              {series.map((p, i) => {
                const value = Math.max(0, p.revenue || 0);
                const maxVal = Math.max(
                  1,
                  ...series.map((pp) => Math.max(0, pp.revenue || 0))
                );
                const height = Math.round((value / maxVal) * 100);
                const label = new Date(p.date).toLocaleDateString();
          icon: UsersIcon,
          trend: [35, 37, 39, 40, 41, 42, 42],
        },
        {
          title: 'Avg eCPM',
          value: currencyFmt.format(Math.max(0, overview.ecpm)),
          change: 0,
          icon: ChartPieIcon,
          trend: [65, 70, 75, 82, 88, 95, 100],
        },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive insights into your ad performance and user engagement
          </p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 text-sm font-bold uppercase rounded ${
                timeRange === range
                  ? 'bg-sunshine-yellow text-primary-blue'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-blue'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-7 w-28 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          ))
        ) : error ? (
          <div role="alert" aria-live="polite" className="col-span-full rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <>
            {metricCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={card.value}
                change={card.change}
                icon={card.icon}
                trend={card.trend}
              />
            ))}
          </>
        )}
      </div>

      {/* User Engagement Funnel */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-6">
          User Engagement Funnel
        </h2>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-white/30 animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : funnel.length === 0 ? (
          <p className="text-white/90">No funnel data for this period.</p>
        ) : (
          <div className="space-y-4">
            {funnel.map((s, i) => (
              <FunnelStep key={i} label={s.label} value={s.value} percentage={s.percent} />
            ))}
          </div>
        )}
      </div>

      {/* Performance Breakdown */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          Top Placements
        </h2>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : performance.length === 0 ? (
          <p className="text-sm text-gray-600">No performance data.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {performance.slice(0, 6).map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-primary-blue font-bold">{row.name}</p>
                  <p className="text-xs text-gray-500">{numberFmt.format(Math.max(0, row.impressions))} impressions</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Revenue</p>
                  <p className="text-lg font-bold text-primary-blue">{currencyFmt.format(Math.max(0, row.revenue))}</p>
                  <p className="text-xs text-gray-500">eCPM {currencyFmt.format(Math.max(0, row.ecpm))}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-Time Activity */}
      <div className="card-blue p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sunshine-yellow font-bold uppercase text-lg">
            Real-Time Activity
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white text-sm">Live</span>
          </div>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center" aria-busy="true">
            {[...Array(4)].map((_, i) => (<div key={i} className="h-14 bg-white/30 animate-pulse rounded" />))}
          </div>
        ) : error ? (
          <p className="text-white">{error}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{currencyFmt.format(Math.max(0, totals.revenue))}</p>
              <p className="text-white text-sm mt-1">Revenue ({timeRange})</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{numberFmt.format(Math.max(0, Math.round(impressionsPerMinute)))}</p>
              <p className="text-white text-sm mt-1">Impressions / min</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{numberFmt.format(Math.max(0, totals.clicks))}</p>
              <p className="text-white text-sm mt-1">Clicks ({timeRange})</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{pctFmt.format(ctrValue)}</p>
              <p className="text-white text-sm mt-1">CTR</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  trend: number[];
}

function MetricCard({ title, value, change, icon: Icon, trend }: MetricCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 font-medium uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-primary-blue mt-1">{value}</h3>
        </div>
        <div className="bg-primary-blue text-sunshine-yellow p-3 rounded">
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {/* Mini sparkline */}
      <div className="flex items-end gap-1 h-8 mb-2">
        {trend.map((height, i) => (
          <div
            key={i}
            className="flex-1 bg-sunshine-yellow rounded-t"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 text-sm">
        <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </span>
        <span className="text-gray-500">vs last period</span>
      </div>
    </div>
  );
}

interface FunnelStepProps {
  label: string;
  value: number;
  percentage: number;
}

function FunnelStep({ label, value, percentage }: FunnelStepProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-white mb-2">
        <span className="font-bold">{label}</span>
        <span>{value.toLocaleString()} ({percentage}%)</span>
      </div>
      <div className="w-full bg-primary-blue/30 h-8 rounded overflow-hidden">
        <div
          className="bg-sunshine-yellow h-full flex items-center justify-end pr-2"
          style={{ width: `${percentage}%` }}
        >
          <span className="text-primary-blue text-sm font-bold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

interface PlatformBarProps {
  platform: string;
  percentage: number;
  users: number;
  color: 'blue' | 'yellow';
}

function PlatformBar({ platform, percentage, users, color }: PlatformBarProps) {
  const bgColor = color === 'yellow' ? 'bg-sunshine-yellow' : 'bg-primary-blue';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-primary-blue">{platform}</span>
        <span className="text-sm text-gray-600">{users.toLocaleString()} users</span>
      </div>
      <div className="w-full bg-gray-200 h-6 rounded overflow-hidden">
        <div
          className={`${bgColor} h-full flex items-center justify-end pr-2`}
          style={{ width: `${percentage}%` }}
        >
          <span className="text-white text-sm font-bold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

interface CountryItemProps {
  country: string;
  users: number;
  percentage: number;
}

function CountryItem({ country, users, percentage }: CountryItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-bold text-primary-blue">{country}</span>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">{users.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

interface AdFormatCardProps {
  format: string;
  impressions: number;
  ecpm: number;
  ctr: number;
  fillRate: number;
}

function AdFormatCard({ format, impressions, ecpm, ctr, fillRate }: AdFormatCardProps) {
  return (
    <div className="border-2 border-primary-blue rounded p-4">
      <h3 className="font-bold text-primary-blue text-lg mb-3">{format}</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Impressions:</span>
          <span className="font-bold text-primary-blue">{impressions.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">eCPM:</span>
          <span className="font-bold text-primary-blue">${ecpm.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">CTR:</span>
          <span className="font-bold text-primary-blue">{ctr}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Fill Rate:</span>
          <span className="font-bold text-primary-blue">{fillRate}%</span>
        </div>
      </div>
    </div>
  );
}
