"use client";
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth';

type Overview = Record<PeriodKey, { revenueCents: number; impressions: number; ecpmCents: number }>

function SkeletonCard() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 animate-pulse" aria-hidden="true">
      <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
      <div className="h-7 w-24 bg-gray-200 rounded mb-2" />
      <div className="flex justify-between">
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function RevenueOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);

  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD';
  const numberFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const currencyFmt = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency }),
    [currency]
  );

  useEffect(() => {
    let mounted = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    (async () => {
      const res = await api.get<Overview>('/api/v1/revenue/overview', { signal: controller?.signal });
      if (!mounted) return;
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load revenue overview');
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    })().catch((e) => {
      if (!mounted) return;
      setError(e?.message || 'Network error');
      setLoading(false);
    });
    return () => {
      mounted = false;
      controller?.abort();
    };
  }, []);

  const cards: { key: PeriodKey; title: string }[] = [
    { key: 'today', title: 'Today' },
    { key: 'yesterday', title: 'Yesterday' },
    { key: 'thisWeek', title: 'This Week' },
    { key: 'thisMonth', title: 'This Month' },
  ];

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Overview</h2>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" aria-busy="true">
          {cards.map((c) => (
            <SkeletonCard key={c.key} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map(({ key, title }) => {
            const period = data![key];
            const revenue = Math.max(0, (period?.revenueCents ?? 0) / 100);
            const impressions = Math.max(0, period?.impressions ?? 0);
            const ecpm = Math.max(0, (period?.ecpmCents ?? 0) / 100);
            return (
              <TimeCard
                key={key}
                title={title}
                revenue={currencyFmt.format(revenue)}
                impressions={numberFmt.format(impressions)}
                ecpm={currencyFmt.format(ecpm)}
              />
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>📊 Start generating revenue by adding your first app and placement</p>
      </div>
    </div>
  );
}

function TimeCard({
  title,
  revenue,
  impressions,
  ecpm,
}: {
  title: string;
  revenue: string;
  impressions: string;
  ecpm: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">{title}</h3>
      <div className="space-y-2">
        <div>
          <p className="text-2xl font-bold text-gray-900">{revenue}</p>
          <p className="text-xs text-gray-500">Revenue</p>
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <p className="font-medium text-gray-700">{impressions}</p>
            <p className="text-xs text-gray-500">Impressions</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">{ecpm}</p>
            <p className="text-xs text-gray-500">eCPM</p>
          </div>
        </div>
      </div>
    </div>
  );
}
