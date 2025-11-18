'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Breadcrumbs, { buildBreadcrumbsFromPath } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';

type AppConfig = {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web' | 'unity' | 'other';
  bundleId?: string;
  packageName?: string;
  sdkKey?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeAppConfig(raw: any): AppConfig {
  return {
    id: String(raw.id),
    name: String(raw.name || raw.title || 'Untitled App'),
    platform: (raw.platform || 'other') as AppConfig['platform'],
    bundleId: raw.bundleId || raw.bundle || undefined,
    packageName: raw.packageName || raw.pkg || undefined,
    sdkKey: raw.sdkKey || raw.key || undefined,
    enabled: !!raw.enabled,
    createdAt: raw.createdAt || undefined,
    updatedAt: raw.updatedAt || undefined,
  };
}

function useCsrf() {
  try {
    const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return m && m[1] ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export default function AppDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = useMemo(() => buildBreadcrumbsFromPath(pathname || '/'), [pathname]);
  const csrf = useCsrf();

  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await api.get(`/apps/${encodeURIComponent(id)}`, { signal: controller?.signal });
      if (!alive) return;
      if (!res.success || !res.data) {
        setError(res.error || 'App not found');
        setLoading(false);
        return;
      }
      setAppConfig(normalizeAppConfig(res.data));
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
  }, [id]);

  async function toggleEnabled() {
    if (!appConfig) return;
    setSaving(true);
    setError(null);
    const next = !appConfig.enabled;
    const res = await api.put(
      `/apps/${encodeURIComponent(appConfig.id)}`,
      { enabled: next },
      { headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } }
    );
    if (!res.success) {
      setError(res.error || 'Failed to update app');
    } else {
      setAppConfig({ ...appConfig, enabled: next });
    }
    setSaving(false);
  }

  async function rotateKey() {
    if (!appConfig) return;
    setSaving(true);
    setError(null);
    const res = await api.post(
      `/apps/${encodeURIComponent(appConfig.id)}/rotate-key`,
      {},
      { headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } }
    );
    if (!res.success || !res.data) {
      setError(res.error || 'Failed to rotate SDK key');
    } else {
      const key = (res.data as any).sdkKey || (res.data as any).data?.sdkKey || appConfig.sdkKey;
      setAppConfig({ ...appConfig, sdkKey: key });
    }
    setSaving(false);
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">App Details</h1>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      ) : !appConfig ? (
        <div className="text-sm text-gray-600">This app could not be found.</div>
      ) : (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <h2 className="text-2xl font-bold text-primary-blue">{appConfig.name}</h2>
                <div className="mt-2 text-sm text-gray-600 flex gap-3">
                  <span>
                    Platform: <strong className="text-primary-blue">{appConfig.platform.toUpperCase()}</strong>
                  </span>
                  {appConfig.bundleId && (
                    <span>
                      Bundle ID: <strong className="text-primary-blue">{appConfig.bundleId}</strong>
                    </span>
                  )}
                  {appConfig.packageName && (
                    <span>
                      Package: <strong className="text-primary-blue">{appConfig.packageName}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleEnabled}
                  disabled={saving}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {appConfig.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={rotateKey}
                  disabled={saving}
                  className="px-4 py-2 text-sm border-2 border-primary-blue text-primary-blue rounded hover:bg-primary-blue hover:text-white disabled:opacity-50"
                >
                  Rotate SDK Key
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-600 uppercase mb-1">SDK Key</p>
              <code className="inline-block bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs break-all">
                {appConfig.sdkKey || '—'}
              </code>
            </div>
            <div className="mt-4 text-sm">
              <button onClick={() => router.push('/dashboard/apps')} className="btn-outline px-6 py-3 text-sm">
                Back to Apps
              </button>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
              Next steps
            </h3>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-2">
              <li>Configure ad networks for this app in Networks.</li>
              <li>Create placements for this app and integrate the SDK.</li>
              <li>Verify live traffic in Observability → Metrics and Debugger.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
