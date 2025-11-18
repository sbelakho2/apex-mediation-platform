"use client";

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Placements Page"
// Ad placements management with performance heatmap and format configuration

import {
  CheckCircleIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

// Placement shape normalized for UI
interface Placement {
  id: string;
  name: string;
  format: 'banner' | 'interstitial' | 'rewarded' | 'native';
  app: string;
  status: 'active' | 'inactive';
  impressions: number;
  revenue: number; // major units
  ecpm: number; // major units
  fillRate: number; // percent 0..100
  ctr: number; // percent 0..100
}

export default function PlacementsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  // Read initial state from the URL (persist filters/pagination)
  const initialFormat = (search.get('format') as any) || 'all';
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'banner' | 'interstitial' | 'rewarded' | 'native'>(initialFormat);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [page, setPage] = useState(Number(search.get('page') || 1));
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USD';
  const curFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency }), [currency]);

  // Keep URL in sync with UI state
  useEffect(() => {
    const params = new URLSearchParams(search?.toString());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('format', selectedFormat);
    // Avoid router spam: only push when something changed
    const next = `${pathname}?${params.toString()}`;
    const curr = `${pathname}?${search?.toString()}`;
    if (next !== curr) router.replace(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, selectedFormat]);

  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    setLoading(true);
    setError(null);
    (async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (selectedFormat !== 'all') params.set('format', selectedFormat);
      const res = await api.get<{ items: any[]; total: number }>(`/placements?${params.toString()}` , { signal: controller?.signal });
      if (!alive) return;
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load placements');
        setLoading(false);
        return;
      }
      const mapped: Placement[] = (res.data.items || []).map((p: any) => ({
        id: String(p.id),
        name: String(p.name || p.title || 'Untitled'),
        format: (p.format || 'banner') as Placement['format'],
        app: String(p.appName || p.app || '—'),
        status: (p.status === 'active' ? 'active' : 'inactive') as Placement['status'],
        impressions: Math.max(0, Number(p.impressions || 0)),
        revenue: Math.max(0, Number(p.revenueCents || 0) / 100),
        ecpm: Math.max(0, Number(p.ecpmCents || 0) / 100),
        fillRate: Math.max(0, Math.min(100, Number(p.fillRate || 0) * (p.fillRate <= 1 ? 100 : 1))),
        ctr: Math.max(0, Math.min(100, Number(p.ctr || 0) * (p.ctr <= 1 ? 100 : 1))),
      }));
      setPlacements(mapped);
      setTotal(Math.max(0, Number(res.data.total || mapped.length)));
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
  }, [page, pageSize, selectedFormat]);

  const [modalState, setModalState] = useState<
    | { type: null }
    | { type: 'create' }
    | { type: 'configure' | 'view-details'; placement: Placement }
  >({ type: null });

  const openModal = (type: 'create' | 'configure' | 'view-details', placement?: Placement) => {
    if (type === 'create') {
      setModalState({ type });
    } else if (placement) {
      setModalState({ type, placement });
    }
  };

  const closeModal = () => setModalState({ type: null });

  // Helpers to discover CSRF token from cookie (best-effort)
  function getCsrf(): string | undefined {
    try {
      const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
      return m && m[1] ? decodeURIComponent(m[1]) : undefined;
    } catch {
      return undefined;
    }
  }

  // API actions — Create / Update / Archive with basic CSRF header
  async function createPlacement(input: { name: string; app: string; format: Placement['format'] }) {
    const res = await api.post('/placements', input, {
      headers: {
        ...(getCsrf() ? { 'X-CSRF-Token': getCsrf()! } : {}),
      },
    });
    if (!res.success) throw new Error(res.error || 'Failed to create placement');
    // Refresh list
    setPage(1);
  }

  async function updatePlacement(id: string, patch: Partial<Placement>) {
    const res = await api.put(`/placements/${id}`, patch, {
      headers: {
        ...(getCsrf() ? { 'X-CSRF-Token': getCsrf()! } : {}),
      },
    });
    if (!res.success) throw new Error(res.error || 'Failed to update placement');
  }

  async function archivePlacement(id: string) {
    const res = await api.delete(`/placements/${id}`, {
      headers: {
        ...(getCsrf() ? { 'X-CSRF-Token': getCsrf()! } : {}),
      },
    });
    if (!res.success) throw new Error(res.error || 'Failed to archive placement');
    // Remove from local list optimistically
    setPlacements((prev) => prev.filter((p) => p.id !== id));
  }

  const handleActivatePlacement = async (id: string) => {
    try {
      await updatePlacement(id, { status: 'active' } as any);
      setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'active' } : p)));
    } catch (e: any) {
      setError(e?.message || 'Failed to activate placement');
    }
  };

  const filteredPlacements = placements; // server-filtered above; keep for safety

  const totalRevenue = placements.reduce((sum, p) => sum + Math.max(0, p.revenue), 0);
  const totalImpressions = placements.reduce((sum, p) => sum + Math.max(0, p.impressions), 0);
  const avgEcpm = totalImpressions > 0 ? totalRevenue / (totalImpressions / 1000) : 0;
  const activePlacements = placements.filter(p => p.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Ad Placements
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage ad placements and optimize performance across all apps
          </p>
        </div>
        <button
          className="btn-primary-yellow px-6 py-3 flex items-center gap-2"
          onClick={() => openModal('create')}
        >
          <PlusCircleIcon className="w-5 h-5" />
          Create Placement
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Active Placements
          </p>
          <p className="text-white text-4xl font-bold">{activePlacements}</p>
          <p className="text-white text-sm mt-1">of {placements.length} total</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Revenue
          </p>
          <p className="text-white text-4xl font-bold">{curFmt.format(totalRevenue)}</p>
          <p className="text-white text-sm mt-1">this week</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Avg eCPM
          </p>
          <p className="text-white text-4xl font-bold">{curFmt.format(avgEcpm)}</p>
          <p className="text-white text-sm mt-1">across all placements</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Impressions
          </p>
          <p className="text-white text-4xl font-bold">{totalImpressions.toLocaleString()}</p>
          <p className="text-white text-sm mt-1">this week</p>
        </div>
      </div>

      {/* Format Filter */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-sm mb-4">
          Filter by Format
        </h2>
        <div className="flex flex-wrap gap-3">
          {['all', 'banner', 'interstitial', 'rewarded', 'native'].map((format) => (
            <button
              key={format}
              onClick={() => setSelectedFormat(format as any)}
              className={`px-6 py-3 text-sm font-bold uppercase rounded transition-colors ${
                selectedFormat === format
                  ? 'bg-sunshine-yellow text-primary-blue'
                  : 'bg-white text-gray-600 border-2 border-gray-300 hover:border-primary-blue'
              }`}
            >
              {format === 'all' ? '📊 All Formats' :
               format === 'banner' ? '📱 Banner' :
               format === 'interstitial' ? '🖼️ Interstitial' :
               format === 'rewarded' ? '🎁 Rewarded' :
               '📰 Native'}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Heatmap */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          Format Performance Comparison
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          <FormatHeatmapCard
            format="Banner"
            icon="📱"
            avgEcpm={10.00}
            avgFillRate={98.9}
            avgCtr={1.05}
            count={2}
          />
          <FormatHeatmapCard
            format="Interstitial"
            icon="🖼️"
            avgEcpm={14.59}
            avgFillRate={96.7}
            avgCtr={3.1}
            count={2}
          />
          <FormatHeatmapCard
            format="Rewarded"
            icon="🎁"
            avgEcpm={22.43}
            avgFillRate={93.5}
            avgCtr={16.7}
            count={3}
          />
          <FormatHeatmapCard
            format="Native"
            icon="📰"
            avgEcpm={0}
            avgFillRate={0}
            avgCtr={0}
            count={1}
            inactive
          />
        </div>
      </div>

      {/* Placements List */}
      <div className="space-y-4">
        <h2 className="text-primary-blue font-bold uppercase text-lg">
          {selectedFormat === 'all' ? 'All Placements' : `${selectedFormat} Placements`}
          <span className="text-gray-500 text-sm ml-2">({total})</span>
        </h2>
        {loading ? (
          <div className="space-y-3" aria-hidden="true">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : filteredPlacements.length === 0 ? (
          <p className="text-sm text-gray-600">No placements found.</p>
        ) : (
          <>
            {filteredPlacements.map((placement) => (
              <PlacementCard
                key={placement.id}
                placement={placement}
                onConfigure={() => openModal('configure', placement)}
                onViewDetails={() => openModal('view-details', placement)}
                onActivate={() => handleActivatePlacement(placement.id)}
              />
            ))}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="text-sm" aria-live="polite">Page {page}</span>
              <button
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                onClick={() => setPage((p) => p + 1)}
                disabled={placements.length < pageSize}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* Best Practices */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-4">
          Placement Best Practices
        </h2>
        <div className="grid md:grid-cols-2 gap-6 text-white text-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Banner Ads</p>
                <p className="text-white/80">Place at top or bottom of screen. Avoid covering content. Refresh every 30-60 seconds.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Interstitial Ads</p>
                <p className="text-white/80">Show at natural break points (level complete, menu transitions). Limit frequency to once per 2-3 minutes.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Rewarded Video</p>
                <p className="text-white/80">Offer clear value (extra lives, hints, coins). Always optional. Show reward before video starts.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Native Ads</p>
                <p className="text-white/80">Match your app's design. Clearly label as "Sponsored". Use in content feeds or articles.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PlacementModal
        state={modalState}
        onClose={closeModal}
        onCreate={async (payload) => {
          try {
            await createPlacement(payload);
            closeModal();
          } catch (e: any) {
            setError(e?.message || 'Failed to create placement');
          }
        }}
        onArchive={async (id) => {
          try {
            if (confirm('Archive this placement? You can re-activate later.')) {
              await archivePlacement(id);
              closeModal();
            }
          } catch (e: any) {
            setError(e?.message || 'Failed to archive placement');
          }
        }}
        onSaveConfig={async (id, patch) => {
          try {
            await updatePlacement(id, patch);
            // Update local state best-effort
            setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as Placement : p)));
            closeModal();
          } catch (e: any) {
            setError(e?.message || 'Failed to save');
          }
        }}
      />
    </div>
  );
}

interface FormatHeatmapCardProps {
  format: string;
  icon: string;
  avgEcpm: number;
  avgFillRate: number;
  avgCtr: number;
  count: number;
  inactive?: boolean;
}

function FormatHeatmapCard({ format, icon, avgEcpm, avgFillRate, avgCtr, count, inactive }: FormatHeatmapCardProps) {
  return (
    <div className={`border-2 rounded p-4 ${inactive ? 'border-gray-300 bg-gray-50' : 'border-primary-blue'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-bold text-primary-blue">{format}</h3>
      </div>
      {inactive ? (
        <p className="text-sm text-gray-600">No active placements</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Avg eCPM:</span>
            <span className="font-bold text-primary-blue">${avgEcpm.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Fill Rate:</span>
            <span className="font-bold text-primary-blue">{avgFillRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Avg CTR:</span>
            <span className="font-bold text-primary-blue">{avgCtr.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Count:</span>
            <span className="font-bold text-primary-blue">{count}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlacementCardProps {
  placement: Placement;
  onConfigure: () => void;
  onViewDetails: () => void;
  onActivate: () => void;
}

function PlacementCard({ placement, onConfigure, onViewDetails, onActivate }: PlacementCardProps) {
  const formatIcons = {
    banner: '📱',
    interstitial: '🖼️',
    rewarded: '🎁',
    native: '📰',
  };

  const formatColors = {
    banner: 'bg-blue-100 text-blue-700',
    interstitial: 'bg-purple-100 text-purple-700',
    rewarded: 'bg-green-100 text-green-700',
    native: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className={`card p-6 ${placement.status === 'active' ? 'border-2 border-sunshine-yellow' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl">{formatIcons[placement.format]}</span>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-primary-blue mb-1">{placement.name}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className={`px-3 py-1 rounded font-bold text-xs ${formatColors[placement.format]}`}>
                {placement.format.toUpperCase()}
              </span>
              <span>{placement.app}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {placement.status === 'active' ? (
            <>
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold text-green-500">Active</span>
            </>
          ) : (
            <>
              <XCircleIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-bold text-gray-500">Inactive</span>
            </>
          )}
        </div>
      </div>

      {placement.status === 'active' ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-600 uppercase">Impressions</p>
            <p className="text-lg font-bold text-primary-blue">{placement.impressions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Revenue</p>
            <p className="text-lg font-bold text-primary-blue">${placement.revenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">eCPM</p>
            <p className="text-lg font-bold text-primary-blue">${placement.ecpm.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Fill Rate</p>
            <p className="text-lg font-bold text-primary-blue">{placement.fillRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">CTR</p>
            <p className="text-lg font-bold text-primary-blue">{placement.ctr}%</p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-300 rounded p-3 space-y-3">
          <p className="text-sm text-gray-700">
            This placement is inactive. Click "Activate" to start serving ads.
          </p>
          <button
            onClick={onActivate}
            className="px-4 py-2 text-sm font-bold text-white bg-success-green rounded hover:bg-success-green/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
          >
            Activate placement
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={onConfigure}
          className="px-4 py-2 text-sm font-bold text-primary-blue border border-primary-blue rounded hover:bg-primary-blue hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
        >
          Configure
        </button>
        <button
          onClick={onViewDetails}
          className="px-4 py-2 text-sm font-bold text-white bg-primary-blue rounded hover:bg-primary-blue/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

type PlacementModalState =
  | { type: null }
  | { type: 'create' }
  | { type: 'configure' | 'view-details'; placement: Placement };

function PlacementModal({
  state,
  onClose,
  onCreate,
  onSaveConfig,
  onArchive,
}: {
  state: PlacementModalState;
  onClose: () => void;
  onCreate: (payload: { name: string; app: string; format: Placement['format'] }) => Promise<void>;
  onSaveConfig: (id: string, patch: Partial<Placement>) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  if (state.type === null) return null;

  const title = state.type === 'create'
    ? 'Create New Placement'
    : state.type === 'configure'
    ? `Configure ${state.placement.name}`
    : `Placement Insights for ${state.placement.name}`;

  // Local form state for create/configure
  const [form, setForm] = useState<{
    name: string;
    app: string;
    format: Placement['format'];
  }>(() => ({
    name: state.type === 'create' ? '' : state.placement.name,
    app: state.type === 'create' ? '' : state.placement.app,
    format: state.type === 'create' ? 'banner' : state.placement.format,
  }));
  const [saving, setSaving] = useState(false);
  const formats: Placement['format'][] = ['banner', 'interstitial', 'rewarded', 'native'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-xl rounded-lg border-2 border-primary-blue bg-white shadow-xl">
        <div className="flex items-start justify-between border-b-2 border-sunshine-yellow p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-primary-blue text-2xl leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {state.type === 'view-details' ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p>Format: <strong className="text-primary-blue">{state.placement.format.toUpperCase()}</strong></p>
              <p>Latest eCPM: <strong className="text-primary-blue">${state.placement.ecpm.toFixed(2)}</strong></p>
              <p>Average Fill Rate: <strong className="text-primary-blue">{state.placement.fillRate}%</strong></p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setSaving(true);
                  if (state.type === 'create') {
                    await onCreate({ name: form.name.trim(), app: form.app.trim(), format: form.format });
                  } else {
                    await onSaveConfig(state.placement.id, { name: form.name.trim(), app: form.app.trim(), format: form.format } as any);
                  }
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="pl-name">Name</label>
                <input
                  id="pl-name"
                  type="text"
                  className="input w-full mt-1"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="pl-app">App</label>
                <input
                  id="pl-app"
                  type="text"
                  className="input w-full mt-1"
                  required
                  value={form.app}
                  onChange={(e) => setForm((f) => ({ ...f, app: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="pl-format">Format</label>
                <select
                  id="pl-format"
                  className="input w-full mt-1"
                  value={form.format}
                  onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as Placement['format'] }))}
                >
                  {formats.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                {state.type === 'configure' && (
                  <button
                    type="button"
                    className="px-6 py-3 text-sm border-2 border-red-500 text-red-600 rounded hover:bg-red-50"
                    onClick={async () => { await onArchive(state.placement.id); }}
                  >
                    Archive
                  </button>
                )}
                <button type="button" onClick={onClose} className="btn-outline px-6 py-3 text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary-yellow px-6 py-3 text-sm">
                  {saving ? 'Saving…' : state.type === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
        {state.type === 'view-details' && (
          <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
            <button onClick={onClose} className="btn-outline px-6 py-3 text-sm">Close</button>
            <a href={`/dashboard/placements/${state.placement.id}`} className="btn-primary-yellow px-6 py-3 text-sm">
              View full report
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
