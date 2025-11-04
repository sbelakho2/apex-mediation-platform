'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { placementApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import { 
  Plus, 
  Search, 
  Filter,
  MoreVertical,
  Eye,
  Pause,
  Play,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import type { Placement } from '@/types'

export default function PlacementsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: placementsData, isLoading } = useQuery({
    queryKey: ['placements', page, pageSize, statusFilter],
    queryFn: async () => {
      const { data } = await placementApi.list({ page, pageSize })
      return data
    },
  })

  const filteredPlacements = placementsData?.data?.filter((placement) => {
    const matchesSearch = search
      ? placement.name.toLowerCase().includes(search.toLowerCase()) ||
        placement.id.toLowerCase().includes(search.toLowerCase())
      : true

    const matchesStatus = statusFilter === 'all' || placement.status === statusFilter

    return matchesSearch && matchesStatus
  }) || []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-600">Monetization Units</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Ad Placements</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your ad inventory and configure waterfall strategies.
              </p>
            </div>
            <Link href="/placements/new" className="btn btn-primary flex items-center gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Placement
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search placements by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-500" aria-hidden="true" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="input w-40"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <PlacementListSkeleton />
        ) : filteredPlacements && filteredPlacements.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4">
              {filteredPlacements.map((placement) => (
                <PlacementCard key={placement.id} placement={placement} />
              ))}
            </div>
            {placementsData && placementsData.hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="btn btn-outline"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  )
}

function PlacementCard({ placement }: { placement: Placement }) {
  const statusColors = {
    active: 'bg-success-100 text-success-700',
    paused: 'bg-warning-100 text-warning-700',
    archived: 'bg-gray-100 text-gray-700',
  }

  const typeIcons = {
    banner: '📱',
    interstitial: '🎯',
    rewarded: '🎁',
  }

  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl" aria-hidden="true">{typeIcons[placement.type]}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{placement.name}</h3>
              <p className="text-xs text-gray-500 font-mono">{placement.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Type:</span>
              <span className="badge badge-info capitalize">{placement.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Format:</span>
              <span className="text-sm font-medium text-gray-700">{placement.format}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <span className={`badge ${statusColors[placement.status]}`}>
                {placement.status}
              </span>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Created {new Date(placement.createdAt).toLocaleDateString()} · 
            Updated {new Date(placement.updatedAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Link
            href={`/placements/${placement.id}`}
            className="btn btn-outline p-2"
            aria-label={`View ${placement.name}`}
          >
            <Eye className="h-4 w-4" />
          </Link>
          <button
            className="btn btn-outline p-2"
            aria-label="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card text-center py-12">
      <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Plus className="h-8 w-8 text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No placements yet</h3>
      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
        Get started by creating your first ad placement. Placements define where ads appear in your app
        and how they&apos;re monetized.
      </p>
      <Link href="/placements/new" className="btn btn-primary inline-flex items-center gap-2">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create Your First Placement
      </Link>
    </div>
  )
}

function PlacementListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card">
          <div className="animate-pulse">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-48"></div>
                    <div className="h-3 bg-gray-200 rounded w-32"></div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-6 bg-gray-200 rounded w-24"></div>
                  <div className="h-6 bg-gray-200 rounded w-24"></div>
                  <div className="h-6 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="h-3 bg-gray-200 rounded w-64"></div>
              </div>
              <div className="flex gap-2">
                <div className="h-9 w-9 bg-gray-200 rounded"></div>
                <div className="h-9 w-9 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
