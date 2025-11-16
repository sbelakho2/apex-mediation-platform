'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adapterApi, placementApi } from '@/lib/api'
import { AlertCircle, ArrowLeft, Save } from 'lucide-react'

const adapterSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  network: z.string().min(2, 'Network name must be at least 2 characters'),
  placementId: z.string().min(1, 'Placement is required'),
  status: z.enum(['active', 'inactive', 'testing']),
  priority: z.coerce.number().int().min(1).max(100),
  ecpm: z.coerce.number().min(0),
  fillRatePercent: z.coerce
    .number({ invalid_type_error: 'Enter a valid number between 0 and 100' })
    .min(0, 'Fill rate must be between 0 and 100%')
    .max(100, 'Fill rate must be between 0 and 100%'),
})

type AdapterFormValues = z.infer<typeof adapterSchema>

export default function NewAdapterPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    data: placements,
    isLoading: loadingPlacements,
    isError: placementsError,
    error: placementsErrorObject,
    refetch: refetchPlacements,
  } = useQuery({
    queryKey: ['placements', 'lookup'],
    queryFn: async () => {
      const { data } = await placementApi.list({ page: 1, pageSize: 200 })
      return data.data
    },
    retry: 1,
  })

  const placementOptions = useMemo(() => placements ?? [], [placements])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdapterFormValues>({
    resolver: zodResolver(adapterSchema),
    defaultValues: {
      status: 'active',
      priority: 1,
      fillRatePercent: 60,
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: AdapterFormValues) => {
      const { data } = await adapterApi.create({
        name: values.name,
        network: values.network,
        placementId: values.placementId,
        status: values.status,
        priority: values.priority,
        ecpm: values.ecpm,
        fillRate: Number(values.fillRatePercent.toFixed(2)),
      })
      return data
    },
    onSuccess: (adapter) => {
      router.push(`/adapters/${adapter.id}`)
    },
    onError: (error: any) => {
      setFormError(error.response?.data?.message || 'Failed to create adapter')
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/adapters"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Back to Adapters
          </Link>
          <div>
            <p className="text-sm font-medium text-primary-600">Demand Partner</p>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Add Adapter</h1>
            <p className="text-sm text-gray-600 mt-1">
              Connect a new network and define its delivery strategy.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          {formError && (
            <div className="card mb-6 bg-danger-50 border-danger-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" aria-hidden={true} />
                <div>
                  <h3 className="text-sm font-semibold text-danger-900">Could not create adapter</h3>
                  <p className="text-sm text-danger-700 mt-1">{formError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="card space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Adapter Details</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="label">
                    Adapter Name <span className="text-danger-600">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    className="input"
                    placeholder="AppLovin Main"
                    {...register('name')}
                  />
                  {errors.name && <p className="text-sm text-danger-600 mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label htmlFor="network" className="label">
                    Network <span className="text-danger-600">*</span>
                  </label>
                  <input
                    id="network"
                    type="text"
                    className="input"
                    placeholder="applovin"
                    {...register('network')}
                  />
                  {errors.network && <p className="text-sm text-danger-600 mt-1">{errors.network.message}</p>}
                </div>

                <div>
                  <label htmlFor="placement" className="label">
                    Placement <span className="text-danger-600">*</span>
                  </label>
                  <select
                    id="placement"
                    className="input"
                    disabled={loadingPlacements || placementsError}
                    {...register('placementId')}
                  >
                    <option value="">
                      {loadingPlacements ? 'Loading placements…' : 'Select placement'}
                    </option>
                    {placementOptions.map((placement) => (
                      <option key={placement.id} value={placement.id}>
                        {placement.name}
                      </option>
                    ))}
                  </select>
                  {errors.placementId && <p className="text-sm text-danger-600 mt-1">{errors.placementId.message}</p>}
                  {placementsError && (
                    <div className="mt-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700" role="alert">
                      <p className="font-medium">We couldn’t load placements.</p>
                      <p className="mt-1">{placementsErrorObject instanceof Error ? placementsErrorObject.message : 'Please try again.'}</p>
                      <button
                        type="button"
                        onClick={() => refetchPlacements()}
                        className="mt-2 text-primary-700 underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!placementsError && !loadingPlacements && placementOptions.length === 0 && (
                    <p className="text-xs text-warning-600 mt-1">No placements found. Create one before adding adapters.</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Select the placement this adapter will compete within.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-gray-200" />

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Controls</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="status" className="label">
                    Status
                  </label>
                  <select id="status" className="input" {...register('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="testing">Testing</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="priority" className="label">
                    Priority (1 = highest) <span className="text-danger-600">*</span>
                  </label>
                  <input id="priority" type="number" min={1} max={100} className="input" {...register('priority')} />
                  {errors.priority && <p className="text-sm text-danger-600 mt-1">{errors.priority.message}</p>}
                </div>

                <div>
                  <label htmlFor="ecpm" className="label">
                    Expected eCPM <span className="text-danger-600">*</span>
                  </label>
                  <input id="ecpm" type="number" step="0.01" min={0} className="input" {...register('ecpm')} />
                  {errors.ecpm && <p className="text-sm text-danger-600 mt-1">{errors.ecpm.message}</p>}
                </div>

                <div>
                  <label htmlFor="fillRate" className="label">
                    Expected Fill Rate (%) <span className="text-danger-600">*</span>
                  </label>
                  <input
                    id="fillRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="input"
                    placeholder="e.g., 72 for 72%"
                    {...register('fillRatePercent')}
                  />
                  {errors.fillRatePercent && <p className="text-sm text-danger-600 mt-1">{errors.fillRatePercent.message}</p>}
                  <p className="text-xs text-gray-500 mt-1">Enter the expected percentage between 0 and 100. We’ll store it exactly as entered.</p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Link href="/adapters" className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
              disabled={isSubmitting || createMutation.isPending}
            >
              <Save className="h-4 w-4" aria-hidden={true} />
              {isSubmitting || createMutation.isPending ? 'Saving...' : 'Create Adapter'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
