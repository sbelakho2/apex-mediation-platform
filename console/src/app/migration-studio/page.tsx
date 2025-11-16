"use client"

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Info, PauseCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { migrationApi, placementApi } from '@/lib/api'
import type { MigrationExperiment, Placement } from '@/types'
import { formatDate, t } from '@/i18n'
import ImportWizard from '@/components/migration-studio/ImportWizard'
import { Spinner } from '@/components/ui/Spinner'

interface Banner {
  id: string
  tone: 'info' | 'success' | 'warning'
  title: string
  description: string
}

const bannerToneStyles: Record<Banner['tone'], string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
}

const bannerIcons: Record<Banner['tone'], LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
}

const statusBadgeStyles: Record<MigrationExperiment['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-sky-100 text-sky-700',
  archived: 'bg-slate-100 text-slate-400',
}

const EXPERIMENT_SKELETON_KEYS = ['experiment-skeleton-1', 'experiment-skeleton-2']
const GUARDRAIL_EVALUATE_COOLDOWN_MS = 4000

export default function MigrationStudioPage() {
  const [selectedPlacement, setSelectedPlacement] = useState<string>('')
  const [showImportWizard, setShowImportWizard] = useState<boolean>(false)

  const placementsQuery = useQuery({
    queryKey: ['placements', 'migration-studio'],
    queryFn: async () => {
      const { data } = await placementApi.list({ page: 1, pageSize: 100 })
      return (data?.data ?? []) as Placement[]
    },
  })

  const experimentsQuery = useQuery({
    queryKey: ['migration-experiments', selectedPlacement],
    enabled: Boolean(selectedPlacement),
    queryFn: async () => {
      if (!selectedPlacement) return []
      return migrationApi.listExperiments({ placementId: selectedPlacement })
    },
  })

  const placements = useMemo(() => placementsQuery.data ?? [], [placementsQuery.data])

  useEffect(() => {
    if (!selectedPlacement && placements.length > 0) {
      setSelectedPlacement(placements[0].id)
    }
  }, [placements, selectedPlacement])

  const currentExperiments = useMemo(() => experimentsQuery.data ?? [], [experimentsQuery.data])
  const banners = useMemo((): Banner[] => {
    if (!selectedPlacement) return []

    const activeExperiments = currentExperiments.filter((experiment) => experiment.status === 'active')
    const pausedExperiments = currentExperiments.filter((experiment) => experiment.status === 'paused')
    const draftExperiments = currentExperiments.filter((experiment) => experiment.status === 'draft')

    const activeBanners: Banner[] = activeExperiments.map((experiment) => ({
      id: `active-${experiment.id}`,
      tone: 'success',
      title: t('migrationStudio.status.active.title', {
        mirrorPercent: experiment.mirror_percent,
        experiment: experiment.name,
      }),
      description: t('migrationStudio.status.active.description', {
        experiment: experiment.name,
      }),
    }))

    const pausedBanners: Banner[] = pausedExperiments.map((experiment) => ({
      id: `paused-${experiment.id}`,
      tone: 'warning',
      title: t('migrationStudio.status.paused.title'),
      description: t('migrationStudio.status.paused.description'),
    }))

    const shouldShowDraft = activeExperiments.length === 0 && pausedExperiments.length === 0
    const draftBanners: Banner[] = shouldShowDraft
      ? draftExperiments.map((experiment) => ({
          id: `draft-${experiment.id}`,
          tone: 'info',
          title: t('migrationStudio.status.draft.title'),
          description: t('migrationStudio.status.draft.description'),
        }))
      : []

    const defaultBanner: Banner = {
      id: 'default',
      tone: 'info',
      title: t('migrationStudio.status.none.title'),
      description: t('migrationStudio.status.none.description'),
    }

    const computedBanners = [...activeBanners, ...pausedBanners, ...draftBanners]
    return computedBanners.length > 0 ? computedBanners : [defaultBanner]
  }, [currentExperiments, selectedPlacement])

  const guardrailSummary = (experiment: MigrationExperiment) => {
    const { guardrails } = experiment
    if (!guardrails) return []
    const summary: string[] = []
    if (guardrails.latency_budget_ms) {
      summary.push(`Latency ≤ ${guardrails.latency_budget_ms}ms`)
    }
    if (typeof guardrails.revenue_floor_percent === 'number') {
      summary.push(`Revenue ≥ ${guardrails.revenue_floor_percent}% of control`)
    }
    if (guardrails.max_error_rate_percent) {
      summary.push(`Error rate ≤ ${guardrails.max_error_rate_percent}%`)
    }
    if (guardrails.min_impressions) {
      summary.push(`Evaluate after ${guardrails.min_impressions.toLocaleString()} impressions`)
    }
    return summary
  }

  const isLoading = placementsQuery.isLoading || experimentsQuery.isLoading

  const [guardrailResult, setGuardrailResult] = useState<
    { experimentId: string; shouldPause: boolean; violations: string[] } | null
  >(null)
  const guardrailCooldownTimers = useRef<Record<string, number>>({})
  const [guardrailCooldowns, setGuardrailCooldowns] = useState<Record<string, boolean>>({})

  const guardrailMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      const result = await migrationApi.evaluateGuardrails(experimentId)
      return {
        experimentId,
        ...result,
      }
    },
    onSuccess: (result) => {
      if (!result) {
        setGuardrailResult(null)
        return
      }

      if (result.shouldPause) {
        void experimentsQuery.refetch()
      }
      setGuardrailResult(result)
    },
  })

  const clearGuardrailCooldown = (experimentId: string) => {
    setGuardrailCooldowns((current) => {
      if (!current[experimentId]) return current
      const { [experimentId]: _omitted, ...rest } = current
      return rest
    })
    if (typeof window !== 'undefined') {
      const timerId = guardrailCooldownTimers.current[experimentId]
      if (timerId) {
        window.clearTimeout(timerId)
        delete guardrailCooldownTimers.current[experimentId]
      }
    }
  }

  const startGuardrailCooldown = (experimentId: string) => {
    if (typeof window === 'undefined') return
    const timerId = window.setTimeout(() => {
      clearGuardrailCooldown(experimentId)
    }, GUARDRAIL_EVALUATE_COOLDOWN_MS)
    guardrailCooldownTimers.current[experimentId] = timerId
    setGuardrailCooldowns((current) => ({
      ...current,
      [experimentId]: true,
    }))
  }

  const handleEvaluateGuardrails = (experimentId: string) => {
    if (guardrailCooldowns[experimentId] || guardrailMutation.isPending) {
      return
    }
    startGuardrailCooldown(experimentId)
    guardrailMutation.mutate(experimentId, {
      onError: () => {
        clearGuardrailCooldown(experimentId)
      },
    })
  }

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return
      Object.values(guardrailCooldownTimers.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
    }
  }, [])

  const activateMutation = useMutation({
    mutationFn: async ({
      experimentId,
      mirrorPercent,
    }: {
      experimentId: string
      mirrorPercent: number
    }) => {
      const experiment = currentExperiments.find((item) => item.id === experimentId)
      if (!experiment) return

      if (experiment.status === 'draft' || experiment.status === 'paused') {
        await migrationApi.activateExperiment(experimentId, { mirror_percent: mirrorPercent })
      } else {
        await migrationApi.updateExperiment(experimentId, { mirror_percent: mirrorPercent })
      }
    },
    onSuccess: () => {
      void experimentsQuery.refetch()
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await migrationApi.pauseExperiment(experimentId, t('migrationStudio.status.paused.title'))
    },
    onSuccess: (_, experimentId) => {
      void experimentsQuery.refetch()
      setGuardrailResult((current) =>
        current && current.experimentId === experimentId ? null : current
      )
    },
  })

  useEffect(() => {
    if (
      guardrailResult &&
      !currentExperiments.some((experiment) => experiment.id === guardrailResult.experimentId)
    ) {
      setGuardrailResult(null)
    }
  }, [currentExperiments, guardrailResult])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm font-medium text-primary-600 uppercase tracking-wide">
            {t('migrationStudio.hero.eyebrow')}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
                {t('migrationStudio.hero.title')}
              </h1>
              <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                {t('migrationStudio.hero.description')}
              </p>
            </div>
            <div className="w-full sm:w-auto flex flex-col sm:items-end gap-3">
              <div className="w-full sm:w-64">
                <label htmlFor="placement-select" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('migrationStudio.placementPicker.label')}
                </label>
                <select
                  id="placement-select"
                  value={selectedPlacement}
                  onChange={(event) => setSelectedPlacement(event.target.value)}
                  className="input w-full"
                  disabled={placementsQuery.isLoading || placements.length === 0}
                >
                  {placements.length === 0 ? (
                    <option value="" disabled>
                      {t('migrationStudio.placementPicker.placeholder')}
                    </option>
                  ) : (
                    placements.map((placement) => (
                      <option key={placement.id} value={placement.id}>
                        {placement.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary flex items-center gap-2"
                onClick={() => setShowImportWizard(true)}
                disabled={!selectedPlacement}
              >
                {t('migrationStudio.import.cta')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="space-y-4">
          {banners.map((banner) => {
            const Icon = bannerIcons[banner.tone]
            return (
              <div
                key={banner.id}
                className={`border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:gap-4 ${bannerToneStyles[banner.tone]}`}
                role="status"
                aria-live="polite"
              >
                <Icon className="h-5 w-5" aria-hidden={true} />
                <div className="mt-3 sm:mt-0">
                  <p className="font-semibold text-base">{banner.title}</p>
                  <p className="text-sm mt-1 leading-relaxed">{banner.description}</p>
                </div>
              </div>
            )
          })}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {t('migrationStudio.experiments.heading')}
            </h2>
            {currentExperiments.length > 0 && (
              <span className="text-sm text-gray-500">
                {currentExperiments.length} {currentExperiments.length === 1 ? 'experiment' : 'experiments'}
              </span>
            )}
          </div>

          {isLoading ? (
            <ExperimentsSkeleton />
          ) : currentExperiments.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {currentExperiments.map((experiment) => {
                const guardrailItems = guardrailSummary(experiment)
                const mirrorControlPercent = Math.min(20, Math.max(1, experiment.mirror_percent || 5))
                const guardrailResultForExperiment =
                  guardrailResult && guardrailResult.experimentId === experiment.id ? guardrailResult : null

                return (
                  <ExperimentCard
                    key={experiment.id}
                    experiment={experiment}
                    guardrailItems={guardrailItems}
                    badgeClass={statusBadgeStyles[experiment.status]}
                    guardrailResult={guardrailResultForExperiment}
                    onEvaluate={() => handleEvaluateGuardrails(experiment.id)}
                    onActivate={() =>
                      activateMutation.mutate({
                        experimentId: experiment.id,
                        mirrorPercent: mirrorControlPercent,
                      })
                    }
                    onPause={() => pauseMutation.mutate(experiment.id)}
                    isEvaluating={
                      guardrailMutation.isPending && guardrailMutation.variables === experiment.id
                    }
                    isActivatePending={
                      activateMutation.isPending &&
                      activateMutation.variables?.experimentId === experiment.id
                    }
                    isPausePending={
                      pauseMutation.isPending && pauseMutation.variables === experiment.id
                    }
                    isCooldownActive={guardrailCooldowns[experiment.id] ?? false}
                  />
                )
              })}
            </div>
          )}
        </section>
      </main>
      {showImportWizard && selectedPlacement && (
        <ImportWizard
          placementId={selectedPlacement}
          onClose={() => setShowImportWizard(false)}
          onCompleted={() => {
            void experimentsQuery.refetch()
          }}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card text-center py-12">
      <div className="mx-auto h-16 w-16 rounded-full bg-primary-50 flex items-center justify-center mb-4">
        <Info className="h-8 w-8 text-primary-500" aria-hidden={true} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">
        {t('migrationStudio.experiments.empty.title')}
      </h3>
      <p className="mt-2 text-sm text-gray-600 max-w-2xl mx-auto">
        {t('migrationStudio.experiments.empty.description')}
      </p>
    </div>
  )
}

function ExperimentsSkeleton() {
  return (
    <div className="space-y-4">
      {EXPERIMENT_SKELETON_KEYS.map((key) => (
        <div key={key} className="card animate-pulse">
          <div className="h-5 w-24 bg-gray-200 rounded" />
          <div className="mt-3 h-6 w-48 bg-gray-200 rounded" />
          <div className="mt-2 h-4 w-64 bg-gray-200 rounded" />
          <div className="mt-4 h-4 w-40 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

type ExperimentCardProps = {
  experiment: MigrationExperiment
  guardrailItems: string[]
  badgeClass: string
  guardrailResult: { shouldPause: boolean; violations: string[] } | null
  onEvaluate: () => void
  onActivate: () => void
  onPause: () => void
  isEvaluating: boolean
  isActivatePending: boolean
  isPausePending: boolean
  isCooldownActive: boolean
}

function ExperimentCard({
  experiment,
  guardrailItems,
  badgeClass,
  guardrailResult,
  onEvaluate,
  onActivate,
  onPause,
  isEvaluating,
  isActivatePending,
  isPausePending,
  isCooldownActive,
}: ExperimentCardProps) {
  const isActive = experiment.status === 'active'
  const isPaused = experiment.status === 'paused'
  const isDraft = experiment.status === 'draft'
  const evaluateDisabled = isEvaluating || isCooldownActive

  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
              {experiment.status}
            </span>
            <span className="text-xs uppercase tracking-wider text-gray-400">
              {t('migrationStudio.experiments.mirrorPercent')}: {experiment.mirror_percent}%
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-gray-900">{experiment.name}</h3>
          {experiment.description && (
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">{experiment.description}</p>
          )}
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>
            {t('migrationStudio.experiments.statusLabel')}: {experiment.status}
          </p>
          <p className="mt-1">
            {t('migrationStudio.experiments.updated', {
              date: formatDate(experiment.updated_at),
            })}
          </p>
          {experiment.mode && (
            <p className="mt-1 text-xs text-gray-400 uppercase tracking-wide">
              {t('migrationStudio.messages.mode', { mode: experiment.mode })}
            </p>
          )}
        </div>
      </div>
      {guardrailItems.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <PauseCircle className="h-4 w-4 text-amber-500" aria-hidden={true} />
          <span className="font-medium uppercase tracking-wide text-gray-500">
            {t('migrationStudio.experiments.guardrails')}:
          </span>
          {guardrailItems.map((item) => (
            <span key={item} className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1">
              {item}
            </span>
          ))}
        </div>
      )}
      {(isActive || isPaused || isDraft) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isActive && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="btn btn-outline flex items-center gap-2"
                onClick={onEvaluate}
                disabled={evaluateDisabled}
              >
                {isEvaluating && (
                  <Spinner size="sm" label={t('migrationStudio.actions.evaluateInFlight')} />
                )}
                {t('migrationStudio.actions.evaluate')}
              </button>
              {isCooldownActive && !isEvaluating ? (
                <span className="text-xs text-gray-500" role="status" aria-live="polite">
                  {t('migrationStudio.messages.guardrailCooldown')}
                </span>
              ) : null}
            </div>
          )}
          {(isDraft || isPaused) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onActivate}
              disabled={isActivatePending}
            >
              {isActivatePending ? (
                <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />
              ) : isPaused ? (
                t('migrationStudio.actions.resume')
              ) : (
                t('migrationStudio.actions.activate')
              )}
            </button>
          )}
          {isActive && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onPause}
              disabled={isPausePending}
            >
              {isPausePending ? (
                <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />
              ) : (
                t('migrationStudio.actions.pause')
              )}
            </button>
          )}
        </div>
      )}
      {guardrailResult && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            guardrailResult.shouldPause
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          <p className="font-medium">
            {guardrailResult.shouldPause
              ? t('migrationStudio.messages.guardrailPaused')
              : t('migrationStudio.messages.guardrailPassed')}
          </p>
          {guardrailResult.violations.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {guardrailResult.violations.map((violation) => (
                <li key={violation}>{violation}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4">
        <Link href={`/migration-studio/${experiment.id}`} className="btn btn-ghost text-sm">
          {t('migrationStudio.experiments.viewDetails')}
        </Link>
      </div>
    </article>
  )
}
