'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PlacementDetailsPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  return (
    <div className="p-6 space-y-6">
      <header className="border-b-2 border-sunshine-yellow pb-4">
        <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
          Placement Detail
        </h1>
        <p className="text-sm text-gray-600">Placement ID: {id}</p>
      </header>

      <div className="card p-6">
        <p className="text-body text-gray-700">
          Detailed analytics, A/B tests, and optimization suggestions for this placement will appear here.
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard/placements" className="btn-outline px-6 py-3 text-sm">
            Back to Placements
          </Link>
          <a href="/documentation#sdk-reference" className="btn-primary-yellow px-6 py-3 text-sm">
            Placement Integration Guide
          </a>
        </div>
      </div>
    </div>
  );
}
