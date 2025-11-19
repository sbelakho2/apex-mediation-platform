'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Networks Page"
// Ad Networks management page — wired to live APIs with resilient UX and accessibility

import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    PlusCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';

type NetworkStatus = 'active' | 'inactive' | 'error';

interface NetworkRow {
  id: string;
  name: string;
  status: NetworkStatus;
  revenue: number;
  impressions: number;
  ecpm: number;
  fillRatePct: number;
  ctr: number;
  uptime?: number;
  healthScore?: number;
  note?: string;
}

type AdapterPerformanceRow = {
  adapterId: string;
  adapterName: string;
  revenue: number;
  impressions: number;
  clicks: number;
  ecpm: number;
  ctr: number;
  avgLatency: number;
};

type AdapterHealthRow = {
  adapterId: string;
  adapterName: string;
  healthScore: number;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  uptime: number;
  errorRate: number;
  fillRate: number;
  revenueShare: number;
  lastIssue?: string;
};

const statusMap: Record<AdapterHealthRow['status'], NetworkStatus> = {
  healthy: 'active',
  degraded: 'active',
  critical: 'error',
  offline: 'inactive',
};

function normalize(perf: AdapterPerformanceRow, health?: AdapterHealthRow): NetworkRow {
  const fillRaw = health?.fillRate ?? 0;
  const fillRatePct = Math.max(0, Math.min(100, fillRaw <= 1 ? fillRaw * 100 : fillRaw));
  const ctrPct = Math.max(0, Math.min(100, perf.ctr ?? 0));
  const status = health ? statusMap[health.status] : 'inactive';
  return {
    id: perf.adapterId,
    name: perf.adapterName || 'Unnamed Network',
    status,
    revenue: Math.max(0, perf.revenue || 0),
    impressions: Math.max(0, perf.impressions || 0),
    ecpm: Math.max(0, perf.ecpm || 0),
    fillRatePct,
    ctr: ctrPct,
    uptime: health?.uptime,
    healthScore: health?.healthScore,
    note: health?.lastIssue,
  };
}

export default function NetworksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof normalize>[]>([]);

  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD';
  const curFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency }), [currency]);
  const numFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);

  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    setLoading(true);
    setError(null);
    (async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const [performanceRes, healthRes] = await Promise.all([
        api.get<{ adapters: AdapterPerformanceRow[] }>(`/reporting/adapters?${params.toString()}`, { signal: controller?.signal }),
        api.get<AdapterHealthRow[]>('/reporting/adapters/health', { signal: controller?.signal }),
      ]);
      if (!alive) return;
      if (!performanceRes.success || !performanceRes.data) {
        setError(performanceRes.error || 'Failed to load adapter performance');
        setLoading(false);
        return;
      }
      const adapters = performanceRes.data.adapters ?? [];
      const healthList = healthRes.success && Array.isArray(healthRes.data) ? healthRes.data : [];
      const healthMap = new Map<string, AdapterHealthRow>();
      healthList.forEach((entry) => {
        healthMap.set(entry.adapterId, entry);
      });
      const mapped: NetworkRow[] = adapters.map((adapter) => normalize(adapter, healthMap.get(adapter.adapterId)));
      // Include adapters that have health signals but no revenue in window
      healthList.forEach((health) => {
        if (!mapped.some((row) => row.id === health.adapterId)) {
          mapped.push(
            normalize(
              {
                adapterId: health.adapterId,
                adapterName: health.adapterName,
                revenue: 0,
                impressions: 0,
                clicks: 0,
                ecpm: 0,
                ctr: 0,
                avgLatency: 0,
              },
              health
            )
          );
        }
      });
      setRows(mapped);
      setLoading(false);
    })().catch((e) => {
      if (!alive) return;
      setError(e?.message || 'Network error');
      setLoading(false);
    });
    return () => { alive = false; controller?.abort(); };
  }, []);

  const activeNetworks = rows.filter((n) => n.status === 'active').length;
  const totalRevenue = rows.reduce((sum, n) => sum + n.revenue, 0);
  const totalImpressions = rows.reduce((sum, n) => sum + n.impressions, 0);

  return (
    <Section>
      <Container className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Ad Networks
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your ad network integrations and monitor performance
          </p>
        </div>
        <button className="btn-primary-yellow px-6 py-3 flex items-center gap-2">
          <PlusCircleIcon className="w-5 h-5" />
          Add Network
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Active Networks
          </p>
          {loading ? (
            <div className="h-9 w-24 bg-white/30 rounded animate-pulse" aria-hidden="true" />
          ) : (
            <>
              <p className="text-white text-4xl font-bold">{activeNetworks}</p>
              <p className="text-white text-sm mt-1">of {rows.length} total</p>
            </>
          )}
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Revenue (Week)
          </p>
          {loading ? (
            <div className="h-9 w-40 bg-white/30 rounded animate-pulse" aria-hidden="true" />
          ) : (
            <>
              <p className="text-white text-4xl font-bold">{curFmt.format(Math.max(0, totalRevenue))}</p>
              <p className="text-white text-sm mt-1">across all networks</p>
            </>
          )}
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Impressions
          </p>
          {loading ? (
            <div className="h-9 w-40 bg-white/30 rounded animate-pulse" aria-hidden="true" />
          ) : (
            <>
              <p className="text-white text-4xl font-bold">{numFmt.format(Math.max(0, totalImpressions))}</p>
              <p className="text-white text-sm mt-1">this week</p>
            </>
          )}
        </div>
      </div>

      {/* Error/empty */}
      {error && (
        <div role="alert" aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {/* Networks Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-6" aria-busy="true">
          {[...Array(4)].map((_, i) => (<div key={i} className="h-40 bg-gray-100 animate-pulse rounded" />))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">No networks connected yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {rows.map((network) => (
            <NetworkCard key={network.id} network={network} curFmt={curFmt} numFmt={numFmt} />
          ))}
        </div>
      )}

      {/* Integration Instructions */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          How to Add a Network
        </h2>
        <ol className="space-y-3 text-body text-gray-700">
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">1.</span>
            <span>
              Click the "Add Network" button above and select your ad network from the list
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">2.</span>
            <span>
              Enter your API credentials (App ID, API Key, etc.) from the network's dashboard
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">3.</span>
            <span>
              Configure bidding parameters: min eCPM, timeout, priority level
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">4.</span>
            <span>
              Test the connection and wait for the first ad request (usually within 5 minutes)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">5.</span>
            <span>
              Monitor performance in real-time and adjust settings as needed
            </span>
          </li>
        </ol>
      </div>
      </Container>
    </Section>
  );
}

interface NetworkCardProps {
  network: ReturnType<typeof normalize>;
  curFmt: Intl.NumberFormat;
  numFmt: Intl.NumberFormat;
}

function NetworkCard({ network, curFmt, numFmt }: NetworkCardProps) {
  const statusConfig = {
    active: {
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bg: 'bg-green-50',
      label: 'Active',
    },
    inactive: {
      icon: XCircleIcon,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      label: 'Inactive',
    },
    error: {
      icon: ExclamationTriangleIcon,
      color: 'text-red-600',
      bg: 'bg-red-50',
      label: 'Error',
    },
  };

  const config = statusConfig[network.status];
  const StatusIcon = config.icon;
  const note = network.note ? `Issue: ${network.note}` : 'No recent incidents';

  return (
    <div className={`card p-6 ${network.status === 'active' ? 'border-2 border-sunshine-yellow' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-primary-blue mb-1">{network.name}</h3>
          <div className={`flex items-center gap-2 ${config.color}`}>
            <StatusIcon className="w-4 h-4" />
            <span className="text-sm font-bold">{config.label}</span>
          </div>
        </div>
        {network.status === 'active' && (
          <div className="bg-sunshine-yellow text-primary-blue px-3 py-1 rounded text-xs font-bold uppercase">
            Live
          </div>
        )}
      </div>

      {/* Metrics */}
      {network.status === 'active' ? (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-600 uppercase">Revenue (Week)</p>
            <p className="text-lg font-bold text-primary-blue">{curFmt.format(Math.max(0, network.revenue))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Impressions</p>
            <p className="text-lg font-bold text-primary-blue">{numFmt.format(Math.max(0, network.impressions))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">eCPM</p>
            <p className="text-lg font-bold text-primary-blue">{curFmt.format(Math.max(0, network.ecpm))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Fill Rate</p>
            <p className="text-lg font-bold text-primary-blue">{Math.round(network.fillRatePct)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">CTR</p>
            <p className="text-lg font-bold text-primary-blue">{Math.round(network.ctr * 10) / 10}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Health Score</p>
            <p className="text-lg font-bold text-primary-blue">{network.healthScore !== undefined ? Math.round(network.healthScore) : '—'}</p>
          </div>
        </div>
      ) : (
        <div className={`${config.bg} p-4 rounded mb-4`}>
          <p className="text-sm text-gray-700">
            {network.status === 'inactive' && 'This network is not connected. Click "Configure" to set up.'}
            {network.status === 'error' && 'Connection error. Check your credentials and try reconnecting. Review logs for details.'}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          {network.uptime !== undefined && (
            <p>Uptime {network.uptime.toFixed(1)}%</p>
          )}
          <p>{note}</p>
        </div>
        <a
          href="/docs/Adapters"
          className="px-4 py-2 text-sm font-bold text-primary-blue border border-primary-blue rounded hover:bg-primary-blue hover:text-white transition-colors"
        >
          Configure
        </a>
      </div>
    </div>
  );
}
