'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function AppDetailsPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  return (
    <div className="p-6 space-y-6">
      <header className="border-b-2 border-sunshine-yellow pb-4">
        <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
          App Overview
        </h1>
        <p className="text-sm text-gray-600">Detailed insights for app ID {id}</p>
      </header>

      <div className="card p-6">
        <p className="text-body text-gray-700">
          This page will display deep-dive metrics, configuration, and debugging information for your application. Manage your placements, SDK versions, and feature flags all in one place.
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard/apps" className="btn-outline px-6 py-3 text-sm">
            Back to Apps
          </Link>
          <a href="/documentation#sdk-reference" className="btn-primary-yellow px-6 py-3 text-sm">
            View SDK Guide
          </a>
        </div>
      </div>
    </div>
  );
}
