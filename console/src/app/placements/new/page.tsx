'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { placementApi } from '@/lib/api'
import { ArrowLeft, Save, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const placementSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  type: z.enum(['banner', 'interstitial', 'rewarded']),
  format: z.string().min(1, 'Format is required'),
  platformId: z.string().min(1, 'Platform ID is required'),
})

type PlacementFormData = z.infer<typeof placementSchema>

export default function NewPlacementPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlacementFormData>({
    resolver: zodResolver(placementSchema),
    defaultValues: {
      type: 'banner',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: PlacementFormData) => {
      const { data: placement } = await placementApi.create(data)
      return placement
    },
    onSuccess: (placement) => {
      router.push(`/placements/${placement.id}`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to create placement')
    },
  })

  const selectedType = watch('type')

  const formatOptions: Record<string, string[]> = {
    banner: ['320x50', '300x250', '728x90', '320x100'],
    interstitial: ['fullscreen', 'portrait', 'landscape'],
    rewarded: ['fullscreen-video', 'rewarded-interstitial'],
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/placements"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Placements
          </Link>
          <div>
            <p className="text-sm font-medium text-primary-600">New Monetization Unit</p>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Create Ad Placement</h1>
            <p className="text-sm text-gray-600 mt-1">
              Configure a new ad placement for your app or game.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))}>
          {error && (
            <div className="card mb-6 bg-danger-50 border-danger-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-danger-900">Creation Failed</h3>
                  <p className="text-sm text-danger-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="card space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="label">
                    Placement Name <span className="text-danger-600">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    {...register('name')}
                    placeholder="e.g., Home Screen Banner, Level Complete Rewarded"
                    className="input"
                  />
                  {errors.name && (
                    <p className="text-sm text-danger-600 mt-1">{errors.name.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    A descriptive name to identify this placement in reports.
                  </p>
                </div>

                <div>
                  <label htmlFor="platformId" className="label">
                    Platform ID (App ID) <span className="text-danger-600">*</span>
                  </label>
                  <input
                    id="platformId"
                    type="text"
                    {...register('platformId')}
                    placeholder="com.example.mygame"
                    className="input font-mono text-sm"
                  />
                  {errors.platformId && (
                    <p className="text-sm text-danger-600 mt-1">{errors.platformId.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Your app bundle ID (iOS) or package name (Android).
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-gray-200" />

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ad Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="type" className="label">
                    Ad Type <span className="text-danger-600">*</span>
                  </label>
                  <select id="type" {...register('type')} className="input">
                    <option value="banner">Banner</option>
                    <option value="interstitial">Interstitial</option>
                    <option value="rewarded">Rewarded Video</option>
                  </select>
                  {errors.type && (
                    <p className="text-sm text-danger-600 mt-1">{errors.type.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Choose the ad format that matches your integration.
                  </p>
                </div>

                <div>
                  <label htmlFor="format" className="label">
                    Ad Format <span className="text-danger-600">*</span>
                  </label>
                  <select id="format" {...register('format')} className="input">
                    <option value="">-- Select format --</option>
                    {formatOptions[selectedType]?.map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt}
                      </option>
                    ))}
                  </select>
                  {errors.format && (
                    <p className="text-sm text-danger-600 mt-1">{errors.format.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Specific size or layout for this ad type.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Link href="/placements" className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSubmitting || createMutation.isPending ? 'Creating...' : 'Create Placement'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
