'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { placementApi } from '@/lib/api'
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
} from 'lucide-react'
import type { Placement } from '@/types'

const PLACEMENT_SKELETON_KEYS = ['placement-skeleton-1', 'placement-skeleton-2', 'placement-skeleton-3', 'placement-skeleton-4', 'placement-skeleton-5']

export default function PlacementsClient() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const pageSize = 20
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const {
    data: placementsPages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['placements', pageSize],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      return placementApi.list({ page: pageParam, pageSize })
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  })

  const placements = useMemo(() => {
    return placementsPages?.pages.flatMap((page) => page.data ?? []) ?? []
  }, [placementsPages])

  const knownStatuses = useMemo(() => {
    const defaults: Array<{ value: string; label: string }> = [
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' },
      { value: 'archived', label: 'Archived' },
    ]

    const dynamic = Array.from(
      placements.reduce<Set<string>>((acc, placement) => {
        if (placement.status) acc.add(placement.status)
        return acc
      }, new Set())
    ).filter((status) => !defaults.some((option) => option.value === status))

    const formattedDynamic = dynamic
      .map((status) => ({
        value: status,
        label: status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return [{ value: 'all', label: 'All Statuses' }, ...defaults, ...formattedDynamic]
  }, [placements])

  const handleLoadMore = useCallback(() => {
    return fetchNextPage().catch(() => {
      // noop — errors surface via query state
    })
  }, [fetchNextPage])

  const filteredPlacements = useMemo(() => {
    if (placements.length === 0) return []

    return placements.filter((placement) => {
      const matchesSearch = search
        ? placement.name.toLowerCase().includes(search.toLowerCase()) ||
          placement.id.toLowerCase().includes(search.toLowerCase())
        : true

      const matchesStatus = statusFilter === 'all' || placement.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [placements, search, statusFilter])

  useEffect(() => {
    if (!hasNextPage) return
    const node = loadMoreRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void handleLoadMore()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(node)

    return () => {
      observer.unobserve(node)
    }
  }, [handleLoadMore, hasNextPage, isFetchingNextPage])

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
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-48"
              >
                {knownStatuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
            {hasNextPage && (
              <div className="mt-6 flex flex-col items-center gap-2" ref={loadMoreRef}>
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  className="btn btn-outline"
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading placements…' : 'Load More'}
                </button>
                <p className="text-xs text-gray-500" aria-live="polite">
                  {isFetchingNextPage
                    ? 'Fetching additional placements…'
                    : 'Scroll to load more automatically'}
                </p>
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
  const statusColors: Record<string, string> = {
    active: 'bg-success-100 text-success-700',
    paused: 'bg-warning-100 text-warning-700',
    archived: 'bg-gray-100 text-gray-700',
  }

  const typeIcons = {
    banner: '📱',
    interstitial: '🎯',
    rewarded: '🎁',
  }

  const supplyChain = placement.supplyChainStatus
  const supplyChainState = supplyChain
    ? supplyChain.authorized
      ? { label: 'Supply chain ok', tone: 'bg-green-100 text-green-800', detail: undefined }
      : { label: 'Supply chain issue', tone: 'bg-amber-100 text-amber-800', detail: supplyChain.reason }
    : undefined

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
              <span className={`badge ${statusColors[placement.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {placement.status.replace(/_/g, ' ')}
              </span>
            </div>
            {supplyChainState && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Supply chain:</span>
                <span className={`badge ${supplyChainState.tone}`}>{supplyChainState.label}</span>
              </div>
            )}
          </div>
          {supplyChainState?.detail && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs px-2 py-1 max-w-xl">
              {supplyChainState.detail}
            </div>
          )}
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
          <button className="btn btn-outline p-2" aria-label="More actions">
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
      {PLACEMENT_SKELETON_KEYS.map((key) => (
        <div key={key} className="card">
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
