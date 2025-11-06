'use client';

import { useEffect, useMemo, useState } from 'react';
import { auctionApi } from '@/lib/auctionApi';

interface DebugEvent {
  placement_id: string;
  request_id: string;
  adapter: string;
  outcome: 'success' | 'no_bid';
  reason?: string;
  timings_ms?: Record<string, number>;
  req_summary?: Record<string, any>;
  resp_summary?: Record<string, any>;
  created_at: string;
}

export default function MediationDebuggerPage() {
  const [placementId, setPlacementId] = useState('');
  const [limit, setLimit] = useState(50);
  const [events, setEvents] = useState<DebugEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await auctionApi.getMediationDebugEvents(placementId, limit);
    if (!res.success) {
      setError(res.error || 'Failed to load debug events');
      setEvents(null);
    } else {
      setError(null);
      setEvents((res.data as DebugEvent[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementId, limit]);

  const grouped = useMemo(() => {
    if (!events) return {} as Record<string, DebugEvent[]>;
    return events.reduce((acc, ev) => {
      const key = ev.adapter;
      acc[key] = acc[key] || [];
      acc[key].push(ev);
      return acc;
    }, {} as Record<string, DebugEvent[]>);
  }, [events]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">Mediation Debugger</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={placementId}
            onChange={(e) => setPlacementId(e.target.value)}
            placeholder="Placement ID (optional)"
            className="w-64 rounded border px-3 py-2 text-sm"
          />
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border px-2 py-2 text-sm"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button onClick={load} className="px-3 py-2 text-sm font-bold uppercase rounded bg-sunshine-yellow text-primary-blue">Refresh</button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
      {loading && <div>Loading…</div>}

      {!loading && events && events.length === 0 && (
        <div className="text-gray-600">No debug events yet. Trigger an auction and try again.</div>
      )}

      {!loading && events && events.length > 0 && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([adapter, list]) => (
            <div key={adapter} className="rounded border">
              <div className="border-b bg-gray-50 p-3 text-sm font-semibold">
                {adapter} — Last {list.length} events
              </div>
              <div className="divide-y">
                {list.slice().reverse().map((ev, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 p-3 text-sm">
                    <div className="col-span-2">
                      <div className="text-gray-500">Time</div>
                      <div className="font-mono">{fmtTime(ev.created_at)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-gray-500">Outcome</div>
                      <OutcomeChip outcome={ev.outcome} reason={ev.reason} />
                    </div>
                    <div className="col-span-3">
                      <div className="text-gray-500">Req</div>
                      <CodeBlock obj={{ placement_id: ev.placement_id, request_id: ev.request_id, ...(ev.req_summary || {}) }} />
                    </div>
                    <div className="col-span-3">
                      <div className="text-gray-500">Resp</div>
                      <CodeBlock obj={ev.resp_summary || {}} />
                    </div>
                    <div className="col-span-2">
                      <div className="text-gray-500">Timings (ms)</div>
                      <CodeInline obj={ev.timings_ms || {}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function OutcomeChip({ outcome, reason }: { outcome: 'success' | 'no_bid'; reason?: string }) {
  const color = outcome === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${color}`}>{outcome}</span>
      {reason && <span className="text-xs text-gray-600">{reason}</span>}
    </div>
  );
}

function CodeBlock({ obj }: { obj: any }) {
  return (
    <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 font-mono text-xs text-gray-800">
      {JSON.stringify(obj, null, 2)}
    </pre>
  );
}

function CodeInline({ obj }: { obj: any }) {
  return (
    <code className="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800">
      {JSON.stringify(obj)}
    </code>
  );
}
