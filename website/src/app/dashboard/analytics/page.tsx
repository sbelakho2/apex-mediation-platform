'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Analytics Page"
// Analytics dashboard wired to live APIs with accessible charts and resilient states

import {
    ArrowPathIcon,
    ChartPieIcon,
    ClockIcon,
    DevicePhoneMobileIcon,
    GlobeAltIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Range = 'today' | 'week' | 'month'

type Overview = Partial<{
  totalUsers: number
  avgSessionSeconds: number
  ctr: number // 0..1
  fillRate: number // 0..1
  requests: number
  dauMau: number // 0..1
  platform: { name: string; percent: number; users: number }[]
  topCountries: { country: string; users: number; percent: number }[]
  formats: { name: string; impressions: number; ecpm: number; ctr: number; fillRate: number }[]
}>

type FunnelStepType = { label: string; value: number; percent: number }

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<Range>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview>({});
  const [funnel, setFunnel] = useState<FunnelStepType[]>([]);

  const numberFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const pctFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }), []);
  const currencyFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD' }), []);

  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    setLoading(true);
    setError(null);
    (async () => {
      const rangeParam = timeRange === 'today' ? '1d' : timeRange === 'week' ? '7d' : '30d';
      const [o, f] = await Promise.all([
        api.get<Overview>(`/api/v1/analytics/overview?range=${rangeParam}`, { signal: controller?.signal }),
        api.get<{ steps: FunnelStepType[] }>(`/api/v1/analytics/funnels?range=${rangeParam}`, { signal: controller?.signal }),
      ]);
      if (!alive) return;
      if (!o.success || !o.data) {
        setError(o.error || 'Failed to load analytics overview');
        setLoading(false);
        return;
      }
      if (!f.success || !f.data) {
        setError(f.error || 'Failed to load funnel');
        setLoading(false);
        return;
      }
      setOverview(o.data);
      setFunnel(f.data.steps || []);
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

  const totalUsers = overview.totalUsers ?? 0;
  const avgSession = overview.avgSessionSeconds ?? 0;
  const ctr = Math.min(1, Math.max(0, overview.ctr ?? 0));
  const fillRate = Math.min(1, Math.max(0, overview.fillRate ?? 0));
  const requests = overview.requests ?? 0;
  const dauMau = Math.min(1, Math.max(0, overview.dauMau ?? 0));

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
            <MetricCard title="Total Users" value={numberFmt.format(totalUsers)} change={0} icon={UsersIcon} trend={[45,52,48,61,58,67,72]} />
            <MetricCard title="Avg Session Duration" value={`${Math.floor(avgSession/60)}m ${Math.round(avgSession%60)}s`} change={0} icon={ClockIcon} trend={[62,58,65,63,70,68,72]} />
            <MetricCard title="Click-Through Rate" value={pctFmt.format(ctr)} change={0} icon={ArrowPathIcon} trend={[58,62,59,55,52,50,48]} />
            <MetricCard title="Fill Rate" value={pctFmt.format(fillRate)} change={0} icon={ChartPieIcon} trend={[82,85,88,90,93,95,98]} />
            <MetricCard title="DAU/MAU Ratio" value={pctFmt.format(dauMau)} change={0} icon={DevicePhoneMobileIcon} trend={[35,37,39,40,41,42,42]} />
            <MetricCard title="Requests" value={numberFmt.format(requests)} change={0} icon={GlobeAltIcon} trend={[65,70,75,82,88,95,100]} />
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

      {/* Platform & Geography Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Platform Distribution */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Platform Distribution
          </h2>
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[...Array(3)].map((_, i) => (<div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : (
            <div className="space-y-4">
              {(overview.platform ?? []).map((p, i) => (
                <PlatformBar key={i} platform={p.name} percentage={p.percent} users={p.users} color={i % 2 ? 'yellow' : 'blue'} />
              ))}
              {(overview.platform ?? []).length === 0 && (
                <p className="text-sm text-gray-600">No platform data.</p>
              )}
            </div>
          )}
        </div>

        {/* Top Countries */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Countries
          </h2>
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[...Array(5)].map((_, i) => (<div key={i} className="h-7 bg-gray-100 animate-pulse rounded" />))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : (
            <div className="space-y-3">
              {(overview.topCountries ?? []).map((c, i) => (
                <CountryItem key={i} country={c.country} users={c.users} percentage={c.percent} />
              ))}
              {(overview.topCountries ?? []).length === 0 && (
                <p className="text-sm text-gray-600">No country breakdown.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ad Format Performance */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          Ad Format Performance
        </h2>
        {loading ? (
          <div className="grid md:grid-cols-3 gap-6 mt-6" aria-busy="true">
            {[...Array(3)].map((_, i) => (<div key={i} className="h-28 bg-gray-100 animate-pulse rounded" />))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 mt-6">
            {(overview.formats ?? []).map((f, i) => (
              <AdFormatCard key={i} format={f.name} impressions={f.impressions} ecpm={f.ecpm} ctr={f.ctr} fillRate={f.fillRate} />
            ))}
            {(overview.formats ?? []).length === 0 && (
              <p className="text-sm text-gray-600">No ad format data.</p>
            )}
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
              <p className="text-sunshine-yellow text-3xl font-bold">{numberFmt.format(totalUsers)}</p>
              <p className="text-white text-sm mt-1">Active Users</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{numberFmt.format(requests / 60)}</p>
              <p className="text-white text-sm mt-1">Impressions/min</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{currencyFmt.format(0)}</p>
              <p className="text-white text-sm mt-1">Revenue/hour</p>
            </div>
            <div>
              <p className="text-sunshine-yellow text-3xl font-bold">{pctFmt.format(fillRate)}</p>
              <p className="text-white text-sm mt-1">Fill Rate</p>
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
