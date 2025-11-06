'use client';

import { useEffect, useState } from 'react';
import { auctionApi } from '@/lib/auctionApi';

interface AdapterMetricsSnapshot {
  adapter: string;
  requests: number;
  success: number;
  no_fill: number;
  timeout: number;
  errors?: Record<string, number>;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
}

export default function AdapterMetricsPage() {
  const [data, setData] = useState<AdapterMetricsSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await auctionApi.getAdapterMetrics();
    if (!res.success) {
      setError(res.error || 'Failed to load metrics');
      setData(null);
    } else {
      setError(null);
      setData(res.data as AdapterMetricsSnapshot[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">Adapter Metrics</h1>
        <button onClick={load} className="px-3 py-2 text-sm font-bold uppercase rounded bg-sunshine-yellow text-primary-blue">Refresh</button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>
      )}

      {loading && <div>Loading…</div>}

      {!loading && data && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Adapter</Th>
                <Th>Requests</Th>
                <Th>Success</Th>
                <Th>No Fill</Th>
                <Th>Timeout</Th>
                <Th>Error Rate</Th>
                <Th>p50 (ms)</Th>
                <Th>p95 (ms)</Th>
                <Th>p99 (ms)</Th>
                <Th>Errors (by reason)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.map((row) => {
                const errorsTotal = row.errors ? Object.values(row.errors).reduce((a, b) => a + b, 0) : 0;
                const errorRate = row.requests ? ((errorsTotal / row.requests) * 100).toFixed(2) + '%' : '0%';
                return (
                  <tr key={row.adapter}>
                    <Td>{row.adapter}</Td>
                    <Td>{row.requests}</Td>
                    <Td>{row.success}</Td>
                    <Td>{row.no_fill}</Td>
                    <Td>{row.timeout}</Td>
                    <Td>{errorRate}</Td>
                    <Td>{row.latency_p50_ms.toFixed(1)}</Td>
                    <Td>{row.latency_p95_ms.toFixed(1)}</Td>
                    <Td>{row.latency_p99_ms.toFixed(1)}</Td>
                    <Td>
                      {row.errors && Object.entries(row.errors).length > 0 ? (
                        <ul className="list-disc pl-5">
                          {Object.entries(row.errors).map(([reason, count]) => (
                            <li key={reason} className="text-sm text-gray-700">
                              <span className="font-medium">{reason}</span>: {count}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (!data || data.length === 0) && (
        <div className="text-gray-600">No metrics available yet. Trigger some adapter requests and try again.</div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{children}</td>;
}
