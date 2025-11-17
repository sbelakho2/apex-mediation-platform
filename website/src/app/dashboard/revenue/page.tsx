"use client";

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Revenue Page"
// Revenue dashboard wired to live APIs with localized charts and resilient states

import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type RangeKey = 'today' | 'week' | 'month' | 'year';

type TimePoint = { ts: string; revenueCents: number; impressions: number; ecpmCents: number };

type RevenueSeries = {
  points: TimePoint[];
};

type TopApp = { name: string; revenueCents: number; impressions: number; percent: number };
type TopNetwork = { name: string; revenueCents: number; ecpmCents: number; percent: number };

export default function RevenuePage() {
  const [timeRange, setTimeRange] = useState<RangeKey>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<RevenueSeries>({ points: [] });
  const [topApps, setTopApps] = useState<TopApp[]>([]);
  const [topNetworks, setTopNetworks] = useState<TopNetwork[]>([]);

  // Localization helpers
  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD';
  const numFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const curFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency }), [currency]);

  // Range mapping for API
  function toApiRange(r: RangeKey): string {
    switch (r) {
      case 'today':
        return '1d';
      case 'week':
        return '7d';
      case 'month':
        return '30d';
      case 'year':
      default:
        return '365d';
    }
  }

  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    setLoading(true);
    setError(null);
    (async () => {
      const range = toApiRange(timeRange);
      // Fetch in parallel; tolerate missing routes by handling { success:false }
      const [s, apps, nets] = await Promise.all([
        api.get<RevenueSeries>(`/api/v1/revenue/timeseries?range=${range}`, { signal: controller?.signal }),
        api.get<{ items: TopApp[] }>(`/api/v1/revenue/top-apps?range=${range}`, { signal: controller?.signal }),
        api.get<{ items: TopNetwork[] }>(`/api/v1/revenue/top-networks?range=${range}`, { signal: controller?.signal }),
      ]);

      if (!alive) return;
      if (!s.success || !s.data) {
        setError(s.error || 'Failed to load revenue data');
        setLoading(false);
        return;
      }
      setSeries({ points: s.data.points || [] });
      setTopApps((apps.success && apps.data?.items) ? apps.data.items : []);
      setTopNetworks((nets.success && nets.data?.items) ? nets.data.items : []);
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

  // Derive current headline stats from the time series
  const totals = useMemo(() => {
    const revenue = series.points.reduce((acc, p) => acc + Math.max(0, (p.revenueCents || 0) / 100), 0);
    const impressions = series.points.reduce((acc, p) => acc + Math.max(0, p.impressions || 0), 0);
    const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
    return { revenue, impressions, ecpm };
  }, [series]);

  // Simple change vs previous segment (best‑effort if series contains at least 2 buckets)
  const changePct = useMemo(() => {
    if (series.points.length < 2) return 0;
    const mid = Math.floor(series.points.length / 2);
    const sum = (pts: TimePoint[]) => pts.reduce((a, p) => a + Math.max(0, (p.revenueCents || 0) / 100), 0);
    const prev = sum(series.points.slice(0, mid));
    const curr = sum(series.points.slice(mid));
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  }, [series]);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Revenue Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Track your earnings and optimize your monetization strategy
          </p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 text-sm font-bold uppercase rounded ${
                timeRange === range
                  ? 'bg-sunshine-yellow text-primary-blue'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-blue'
              }`}
              aria-pressed={timeRange === range}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div role="alert" aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              title="Total Revenue"
              value={curFmt.format(Math.max(0, totals.revenue))}
              change={changePct}
              icon={CurrencyDollarIcon}
              color="yellow"
            />
            <StatCard
              title="Impressions"
              value={numFmt.format(Math.max(0, totals.impressions))}
              change={undefined}
              icon={ChartBarIcon}
              color="blue"
            />
            <StatCard
              title="eCPM"
              value={curFmt.format(Math.max(0, totals.ecpm))}
              change={undefined}
              icon={ArrowTrendingUpIcon}
              color="yellow"
            />
            <StatCard
              title="Next Payout"
              value={curFmt.format(0)}
              subtitle="Configure your payout details in Settings"
              icon={BanknotesIcon}
              color="blue"
            />
          </>
        )}
      </div>

      {/* Revenue Chart */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-6">
          Revenue Trend
        </h2>
        {loading ? (
          <div className="h-64 animate-pulse bg-white/30 rounded" aria-hidden="true" />
        ) : series.points.length === 0 ? (
          <p className="text-white">No data for this period.</p>
        ) : (
          <div className="h-64 flex items-end justify-between gap-2" aria-live="polite">
            {series.points.map((p, i) => {
              const value = Math.max(0, (p.revenueCents || 0) / 100);
              // Normalize heights within this series (avoid division by zero)
              const maxVal = Math.max(
                1,
                ...series.points.map((pp) => Math.max(0, (pp.revenueCents || 0) / 100))
              );
              const height = Math.round((value / maxVal) * 100);
              const label = new Date(p.ts).toLocaleDateString();
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2" aria-label={`${label}: ${curFmt.format(value)}`}>
                  <div
                    className="w-full bg-sunshine-yellow rounded-t transition-all hover:opacity-80"
                    style={{ height: `${height}%` }}
                    title={`${label} — ${curFmt.format(value)}`}
                  />
                  <span className="text-xs text-white font-bold">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Performing Apps & Networks */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Apps */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Performing Apps
          </h2>
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : topApps.length === 0 ? (
            <p className="text-sm text-gray-600">No app breakdown for this period.</p>
          ) : (
            <div className="space-y-3">
              {topApps.map((a, i) => (
                <AppRevenueItem
                  key={i}
                  name={a.name}
                  revenue={Math.max(0, a.revenueCents / 100)}
                  percentage={Math.max(0, Math.min(100, a.percent))}
                  impressions={Math.max(0, a.impressions)}
                  curFmt={curFmt}
                />
              ))}
            </div>
          )}
        </div>

        {/* Top Networks */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Ad Networks
          </h2>
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : topNetworks.length === 0 ? (
            <p className="text-sm text-gray-600">No network breakdown for this period.</p>
          ) : (
            <div className="space-y-3">
              {topNetworks.map((n, i) => (
                <NetworkRevenueItem
                  key={i}
                  name={n.name}
                  revenue={Math.max(0, n.revenueCents / 100)}
                  percentage={Math.max(0, Math.min(100, n.percent))}
                  ecpm={Math.max(0, n.ecpmCents / 100)}
                  curFmt={curFmt}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payout Information */}
      <div className="card-blue p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-2">
              Next Payout Schedule
            </h2>
            <p className="text-white text-body mb-4">
              Configure payout destination and threshold to enable automated transfers.
            </p>
            <div className="space-y-2 text-sm text-white">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sunshine-yellow rounded-full" />
                <span>Minimum threshold: configurable in Settings</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sunshine-yellow rounded-full" />
                <span>Supported methods depend on your region and currency</span>
              </div>
            </div>
          </div>
          <a
            href="/dashboard/settings"
            className="btn-primary-yellow px-6 py-2 text-sm"
          >
            Update Settings
          </a>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'yellow' | 'blue';
}

function StatCard({ title, value, change, subtitle, icon: Icon, color }: StatCardProps) {
  const bgColor = color === 'yellow' ? 'bg-sunshine-yellow' : 'bg-primary-blue';
  const textColor = color === 'yellow' ? 'text-primary-blue' : 'text-sunshine-yellow';

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600 font-medium uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-primary-blue mt-1">{value}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${bgColor} ${textColor} p-3 rounded`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
            {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-gray-500">vs last period</span>
        </div>
      )}
    </div>
  );
}

interface AppRevenueItemProps {
  name: string;
  revenue: number;
  percentage: number;
  impressions: number;
  curFmt: Intl.NumberFormat;
}
function AppRevenueItem({ name, revenue, percentage, impressions, curFmt }: AppRevenueItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="font-bold text-primary-blue">{name}</p>
        <p className="text-xs text-gray-500">{impressions.toLocaleString()} impressions</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">{curFmt.format(revenue)}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

interface NetworkRevenueItemProps {
  name: string;
  revenue: number;
  percentage: number;
  ecpm: number;
  curFmt: Intl.NumberFormat;
}

function NetworkRevenueItem({ name, revenue, percentage, ecpm, curFmt }: NetworkRevenueItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="font-bold text-primary-blue">{name}</p>
        <p className="text-xs text-gray-500">eCPM: {curFmt.format(ecpm)}</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">{curFmt.format(revenue)}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card p-6 animate-pulse" aria-hidden="true">
      <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-7 w-28 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  );
}
