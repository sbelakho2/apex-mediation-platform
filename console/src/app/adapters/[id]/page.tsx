'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adapterApi, placementApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import { ArrowLeft, Save, Trash2, Signal, Zap, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Adapter } from '@/types'

interface PageProps {
  params: { id: string }
}

const adapterUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'testing']),
  priority: z.coerce.number().int().min(1).max(100),
  ecpm: z.coerce.number().min(0),
  fillRatePercent: z.coerce.number().min(0).max(100),
})

type AdapterUpdateValues = z.infer<typeof adapterUpdateSchema>

export default function AdapterDetailPage({ params }: PageProps) {
  const { id } = params
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const CONFIRM_KEYWORD = 'DELETE'

  const { data: adapter, isLoading } = useQuery({
    queryKey: ['adapter', id],
    queryFn: async () => {
      const { data } = await adapterApi.get(id)
      return data
    },
  })

  const { data: placement } = useQuery({
    queryKey: ['placement', adapter?.placementId],
    queryFn: async () => {
      if (!adapter?.placementId) return null
      return await placementApi.get(adapter.placementId)
    },
    enabled: !!adapter?.placementId,
  })

  const form = useForm<AdapterUpdateValues>({
    resolver: zodResolver(adapterUpdateSchema),
    defaultValues: {
      status: 'active',
      priority: 1,
      ecpm: 0,
      fillRatePercent: 0,
    },
  })

  useEffect(() => {
    if (adapter) {
      form.reset({
        status: adapter.status,
        priority: adapter.priority,
        ecpm: adapter.ecpm,
        fillRatePercent: Number((adapter.fillRate * 100).toFixed(1)),
      })
    }
  }, [adapter, form])

  const updateMutation = useMutation({
    mutationFn: async (values: AdapterUpdateValues) => {
      const { data } = await adapterApi.update(id, {
        status: values.status,
        priority: values.priority,
        ecpm: values.ecpm,
        fillRate: Number((values.fillRatePercent / 100).toFixed(4)),
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adapter', id] })
      queryClient.invalidateQueries({ queryKey: ['adapters'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => adapterApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adapters'] })
      router.push('/adapters')
    },
  })

  if (isLoading || !adapter) {
    return <AdapterSkeleton />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/adapters"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Back to Adapters
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-600">{adapter.network.toUpperCase()} Network</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">{adapter.name}</h1>
              <p className="text-xs font-mono text-gray-500 mt-1">{adapter.id}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="btn btn-danger flex items-center gap-2"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" aria-hidden={true} />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Adapter'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryMetric label="Priority" value={`#${adapter.priority}`} icon={Signal} />
          <SummaryMetric label="eCPM" value={`$${adapter.ecpm?.toFixed(2) || '0.00'}`} icon={Zap} />
          <SummaryMetric label="Fill Rate" value={`${((adapter.fillRate || 0) * 100).toFixed(1)}%`} icon={Loader2} />
        </section>

        <section className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuration</h2>
          <form onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="label">
                  Status
                </label>
                <select id="status" className="input" {...form.register('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="testing">Testing</option>
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="label">
                  Priority
                </label>
                <input id="priority" type="number" className="input" {...form.register('priority')} />
                {form.formState.errors.priority && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.priority.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="ecpm" className="label">
                  Expected eCPM
                </label>
                <input id="ecpm" type="number" className="input" {...form.register('ecpm')} />
                {form.formState.errors.ecpm && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.ecpm.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="fillRate" className="label">
                  Fill Rate (%)
                </label>
                <input id="fillRate" type="number" className="input" {...form.register('fillRatePercent')} />
                {form.formState.errors.fillRatePercent && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.fillRatePercent.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                className="btn btn-primary flex items-center gap-2"
                disabled={updateMutation.isPending}
              >
                <Save className="h-4 w-4" aria-hidden={true} />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </section>

        {confirmDeleteOpen && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/30"
              role="button"
              aria-label="Close confirmation dialog"
              tabIndex={0}
              onClick={() => setConfirmDeleteOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setConfirmDeleteOpen(false)
                }
              }}
            />
            <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900">Confirm deletion</h3>
              <p className="text-sm text-gray-600 mt-2">
                This will permanently remove the adapter &quot;{adapter.name}&quot;. Type <span className="font-mono">{CONFIRM_KEYWORD}</span> to
                confirm.
              </p>
              <input
                aria-label="Confirmation keyword"
                className="input mt-4 w-full"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder={CONFIRM_KEYWORD}
              />
              <div className="mt-6 flex items-center justify-end gap-3">
                <button className="btn" onClick={() => setConfirmDeleteOpen(false)} disabled={deleteMutation.isPending}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending || confirmText !== CONFIRM_KEYWORD}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {placement && (
          <section className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Placement</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div>
                Linked placement:{' '}
                <Link href={`/placements/${placement.id}`} className="text-primary-600 hover:underline font-medium">
                  {placement.name}
                </Link>
              </div>
              <div className="font-mono text-xs text-gray-500">{placement.id}</div>
              <div className="text-xs text-gray-400">
                Created {new Date(placement.createdAt).toLocaleString()} · Updated{' '}
                {new Date(placement.updatedAt).toLocaleString()}
              </div>
            </div>
          </section>
        )}

        <section className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <SnapshotMetric label="Requests" value={formatNumber(adapter.requestCount)} />
            <SnapshotMetric label="Impressions" value={formatNumber(adapter.impressionCount)} />
            <SnapshotMetric label="Status" value={adapter.status.toUpperCase()} />
            <SnapshotMetric label="Updated" value={new Date(adapter.updatedAt).toLocaleString()} />
          </div>
        </section>
      </main>
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
        <Icon className="h-4 w-4 text-primary-600" aria-hidden={true} />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function AdapterSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-8 w-80 rounded bg-gray-200" />
            <div className="h-3 w-48 rounded bg-gray-200" />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card animate-pulse h-64" />
      </main>
    </div>
  )
}
