"use client";
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type KpisResponse = {
  todayRevenueCents: number;
  yesterdayRevenueCents?: number;
  totalImpressions: number;
  yesterdayImpressions?: number;
  ecpmCents: number; // for today or current window
  yesterdayEcpmCents?: number;
  fillRate: number; // 0..1
  yesterdayFillRate?: number; // 0..1
};

function percentChange(current: number, previous?: number): { label: string; trend: 'up' | 'down' | 'neutral' } {
  if (previous === undefined || previous === null) return { label: '—', trend: 'neutral' };
  if (previous === 0) return { label: current > 0 ? '+100%' : '0%', trend: current > 0 ? 'up' : 'neutral' };
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(delta);
  const trend: 'up' | 'down' | 'neutral' = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'neutral';
  const sign = rounded > 0 ? '+' : '';
  return { label: `${sign}${rounded}%`, trend };
}

function SkeletonStat() {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg p-5 animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-28 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  );
}

export default function DashboardStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);

  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD';
  const currencyFmt = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency }),
    [currency]
  );
  const numberFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const pctFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await api.get<KpisResponse>('/api/v1/dashboard/kpis');
      if (!alive) return;
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load KPIs');
      } else {
        setKpis(res.data);
      }
      setLoading(false);
    })().catch((e) => {
      if (!alive) return;
      setError(e?.message || 'Network error');
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" aria-live="polite" className="mt-8 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  const todayRevenue = Math.max(0, (kpis?.todayRevenueCents ?? 0) / 100);
  const yRev = Math.max(0, ((kpis?.yesterdayRevenueCents ?? 0) as number) / 100);
  const impressions = Math.max(0, kpis?.totalImpressions ?? 0);
  const yImp = Math.max(0, kpis?.yesterdayImpressions ?? 0);
  const ecpm = Math.max(0, (kpis?.ecpmCents ?? 0) / 100);
  const yEcpm = Math.max(0, (kpis?.yesterdayEcpmCents ?? 0) / 100);
  const fill = Math.min(1, Math.max(0, kpis?.fillRate ?? 0));
  const yFill = Math.min(1, Math.max(0, kpis?.yesterdayFillRate ?? 0));

  const revChange = percentChange(todayRevenue, yRev);
  const impChange = percentChange(impressions, yImp);
  const ecpmChange = percentChange(ecpm, yEcpm);
  const fillChange = percentChange(fill, yFill);

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Today's Revenue" value={currencyFmt.format(todayRevenue)} change={revChange.label} trend={revChange.trend} />
      <StatCard title="Total Impressions" value={numberFmt.format(impressions)} change={impChange.label} trend={impChange.trend} />
      <StatCard title="eCPM" value={currencyFmt.format(ecpm)} change={ecpmChange.label} trend={ecpmChange.trend} />
      <StatCard title="Fill Rate" value={pctFmt.format(fill)} change={fillChange.label} trend={fillChange.trend} />
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  trend,
}: {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  const trendColor = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600',
  }[trend];

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-1">
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
          </div>
        </div>
        <div className="mt-4">
          <span className={`text-sm font-medium ${trendColor}`}>{change}</span>
          <span className="text-sm text-gray-500 ml-2">vs yesterday</span>
        </div>
      </div>
    </div>
  );
}
