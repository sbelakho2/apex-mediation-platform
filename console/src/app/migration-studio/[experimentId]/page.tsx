"use client"

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type InputHTMLAttributes } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  PauseCircle,
  Play,
  RefreshCcw,
  Save,
} from 'lucide-react'
import { migrationApi } from '@/lib/api'
import type { MigrationExperiment, MigrationGuardrails } from '@/types'
import { formatDate, t } from '@/i18n'
import { Spinner } from '@/components/ui/Spinner'

const statusBadgeStyles: Record<MigrationExperiment['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-sky-100 text-sky-700',
  archived: 'bg-slate-100 text-slate-400',
}

type GuardrailFormState = {
  latency_budget_ms: string
  revenue_floor_percent: string
  max_error_rate_percent: string
  min_impressions: string
}

const emptyGuardrailState: GuardrailFormState = {
  latency_budget_ms: '',
  revenue_floor_percent: '',
  max_error_rate_percent: '',
  min_impressions: '',
}

export default function MigrationExperimentPage() {
  const params = useParams<{ experimentId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const experimentId = params?.experimentId ?? ''

  const [mirrorPercent, setMirrorPercent] = useState<number>(5)
  const [guardrailState, setGuardrailState] = useState<GuardrailFormState>(emptyGuardrailState)
  const [guardrailResult, setGuardrailResult] = useState<{
    shouldPause: boolean
    violations: string[]
  } | null>(null)
  const [showSavedBanner, setShowSavedBanner] = useState<boolean>(false)

  const experimentQuery = useQuery({
    queryKey: ['migration-experiment', experimentId],
    enabled: Boolean(experimentId),
    queryFn: async () => {
      if (!experimentId) return null
      return migrationApi.getExperiment(experimentId)
    },
  })

  const experiment = experimentQuery.data ?? null

  useEffect(() => {
    if (experiment) {
  setMirrorPercent(Math.min(20, Math.max(0, experiment.mirror_percent)))
      const guardrails = experiment.guardrails ?? {}
      setGuardrailState({
        latency_budget_ms: guardrails.latency_budget_ms?.toString() ?? '',
        revenue_floor_percent: guardrails.revenue_floor_percent?.toString() ?? '',
        max_error_rate_percent: guardrails.max_error_rate_percent?.toString() ?? '',
        min_impressions: guardrails.min_impressions?.toString() ?? '',
      })
    }
  }, [experiment])

  const isDraft = experiment?.status === 'draft'
  const isActive = experiment?.status === 'active'
  const isPaused = experiment?.status === 'paused'

  const currentGuardrails = useMemo<Partial<MigrationGuardrails>>(
    () => experiment?.guardrails ?? {},
    [experiment]
  )

  const parsedGuardrails: Partial<MigrationGuardrails> = useMemo(() => {
    const toNumber = (value: string) => {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return undefined
  const numeric = Number(trimmed)
      return Number.isFinite(numeric) ? numeric : undefined
    }

    return {
          <div className="pt-4 border-t border-gray-100">
      revenue_floor_percent: toNumber(guardrailState.revenue_floor_percent),
      max_error_rate_percent: toNumber(guardrailState.max_error_rate_percent),
      min_impressions: toNumber(guardrailState.min_impressions),
    }
  }, [guardrailState])

  const isDirty = useMemo(() => {
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
    const guardrailChanged = ['latency_budget_ms', 'revenue_floor_percent', 'max_error_rate_percent', 'min_impressions'].some(
      (key) => {
        const typedKey = key as keyof MigrationGuardrails
        const currentValue = currentGuardrails?.[typedKey]
        const nextValue = parsedGuardrails[typedKey]
        return (currentValue ?? undefined) !== (nextValue ?? undefined)
      }
    )
    return guardrailChanged || experiment.mirror_percent !== mirrorPercent
  }, [currentGuardrails, experiment, mirrorPercent, parsedGuardrails])

  const invalidateExperimentQueries = (updated: MigrationExperiment) => {
    queryClient.setQueryData(['migration-experiment', experimentId], updated)
    queryClient.invalidateQueries({ queryKey: ['migration-experiments'] })
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!experiment) return null
      const payload: { mirror_percent: number; guardrails: Partial<MigrationGuardrails> } = {
        mirror_percent: mirrorPercent,
        guardrails: parsedGuardrails,
      }
      const updated = await migrationApi.updateExperiment(experiment.id, payload)
      return updated
    },
    onSuccess: (updated) => {
      if (updated) {
        invalidateExperimentQueries(updated)
        setGuardrailResult(null)
        setShowSavedBanner(true)
      }
    },
  })

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!experiment) return null
      const updated = await migrationApi.activateExperiment(experiment.id, { mirror_percent: mirrorPercent })
      return updated
    },
    onSuccess: (updated) => {
      if (updated) {
        invalidateExperimentQueries(updated)
        setGuardrailResult(null)
      }
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!experiment) return null
      const updated = await migrationApi.pauseExperiment(
        experiment.id,
        t('migrationStudio.detail.pauseReason')
      )
      return updated
    },
    onSuccess: (updated) => {
      if (updated) {
        invalidateExperimentQueries(updated)
      }
    },
  })

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      if (!experiment) return null
      const result = await migrationApi.evaluateGuardrails(experiment.id)
      return result
    },
    onSuccess: (result) => {
      if (result) {
        setGuardrailResult(result)
        if (result.shouldPause) {
          void experimentQuery.refetch()
          queryClient.invalidateQueries({ queryKey: ['migration-experiments'] })
        }
      }
    },
  })

  useEffect(() => {
    if (guardrailResult && guardrailResult.shouldPause && experiment?.status === 'paused') {
      setGuardrailResult(null)
    }
  }, [experiment?.status, guardrailResult])

  useEffect(() => {
    if (!showSavedBanner) return
    const timeout = window.setTimeout(() => setShowSavedBanner(false), 4000)
    return () => window.clearTimeout(timeout)
  }, [showSavedBanner])

  if (!experimentId) {
    return null
  }

  if (experimentQuery.isLoading) {
    return (
        <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('migrationStudio.detail.nextStepsHeading')}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {t('migrationStudio.detail.nextStepsCopy')}
            </p>
          </div>
          <Link href="/migration-studio" className="btn btn-outline flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" aria-hidden={true} />
            {t('migrationStudio.detail.backToOverview')}
          </Link>
        </section>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card border border-rose-200 bg-rose-50 text-rose-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5" aria-hidden={true} />
              <div>
                <h1 className="text-lg font-semibold">
                  {t('migrationStudio.detail.loadErrorTitle')}
                </h1>
                <p className="mt-1 text-sm">
                <button
                  type="button"
  min,
  step,
                  className="btn btn-outline mt-4"
                  onClick={() => router.push('/migration-studio')}
              </div>
  suffix: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
          </div>
  min?: number
  step?: string
        </main>
      </div>
    )
  }
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          inputMode={inputMode}
          min={min}
          step={step}
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-sm text-gray-500">{suffix}</span>
      </div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-primary-600">
                {t('migrationStudio.detail.eyebrow')}
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-gray-900">
                {experiment.name}
              </h1>
              {experiment.description && (
                <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                  {experiment.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}`}>
                  {experiment.status}
                </span>
                <span className="uppercase tracking-wide text-xs text-gray-400">
                  {t('migrationStudio.experiments.mirrorPercent')}: {experiment.mirror_percent}%
                </span>
                {experiment.mode && (
                  <span className="uppercase tracking-wide text-xs text-gray-400">
                    {t('migrationStudio.messages.mode', { mode: experiment.mode })}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
              <div>{t('migrationStudio.detail.objectiveLabel')}: {experiment.objective}</div>
              <div>{t('migrationStudio.detail.seedLabel')}: <span className="font-mono text-gray-600">{experiment.seed}</span></div>
              <div>
                {t('migrationStudio.detail.updatedLabel', {
                  date: formatDate(experiment.updated_at),
                })}
              </div>
              {experiment.last_guardrail_check && (
                <div>
                  {t('migrationStudio.detail.lastGuardrailCheck', {
                    date: formatDate(experiment.last_guardrail_check),
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {showSavedBanner && (
          <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-xl px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5" aria-hidden={true} />
            <div>
              <p className="font-medium text-sm">
                {t('migrationStudio.detail.saveSuccessTitle')}
              </p>
              <p className="text-xs mt-1">
                {t('migrationStudio.detail.saveSuccessCopy')}
              </p>
            </div>
          </div>
        )}

        <section className="card space-y-6">
            <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t('migrationStudio.detail.mirrorHeading')}
              </h2>
              <p className="mt-1 text-sm text-gray-600 max-w-2xl">
                {t('migrationStudio.detail.mirrorDescription')}
              </p>
            </div>
            {(isDraft || isPaused) && (
              <button
                type="button"
                className="btn btn-primary flex items-center gap-2"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
              >
                {activateMutation.isPending ? (
                  <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden={true} />
                    {isPaused ? t('migrationStudio.actions.resume') : t('migrationStudio.actions.activate')}
                  </>
                )}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                className="btn btn-secondary flex items-center gap-2"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />
                ) : (
                  <>
                    <PauseCircle className="h-4 w-4" aria-hidden={true} />
                    {t('migrationStudio.actions.pause')}
                  </>
                )}
              </button>
            )}
          </div>

          <div>
            <label htmlFor="mirror-percent" className="block text-sm font-medium text-gray-700">
              {t('migrationStudio.detail.mirrorPercentLabel')}
            </label>
            <div className="mt-3">
              <input
                id="mirror-percent"
                type="range"
                min={0}
                max={20}
                step={1}
                value={mirrorPercent}
                onChange={(event) => setMirrorPercent(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={20}
                value={mirrorPercent}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  setMirrorPercent(Math.min(20, Math.max(0, next)))
                }}
                className="input w-28"
                aria-describedby="mirror-percent-helper"
              />
              <span className="text-sm text-gray-500" id="mirror-percent-helper">
                {t('migrationStudio.detail.mirrorPercentHelper')}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('migrationStudio.detail.guardrailHeading')}
            </h3>
            <p className="mt-1 text-sm text-gray-600 max-w-2xl">
              {t('migrationStudio.detail.guardrailDescription')}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <GuardrailField
                label={t('migrationStudio.detail.latencyLabel')}
                suffix={t('migrationStudio.detail.latencySuffix')}
                value={guardrailState.latency_budget_ms}
                onChange={(value) => setGuardrailState((current) => ({ ...current, latency_budget_ms: value }))}
                inputMode="numeric"
                min={0}
              />
              <GuardrailField
                label={t('migrationStudio.detail.revenueLabel')}
                suffix={t('migrationStudio.detail.revenueSuffix')}
                value={guardrailState.revenue_floor_percent}
                onChange={(value) => setGuardrailState((current) => ({ ...current, revenue_floor_percent: value }))}
                inputMode="decimal"
                min={0}
                step="0.1"
              />
              <GuardrailField
                label={t('migrationStudio.detail.errorRateLabel')}
                suffix={t('migrationStudio.detail.revenueSuffix')}
                value={guardrailState.max_error_rate_percent}
                onChange={(value) => setGuardrailState((current) => ({ ...current, max_error_rate_percent: value }))}
                inputMode="decimal"
                min={0}
                step="0.1"
              />
              <GuardrailField
                label={t('migrationStudio.detail.minImpressionsLabel')}
                suffix={t('migrationStudio.detail.minImpressionsSuffix')}
                value={guardrailState.min_impressions}
                onChange={(value) => setGuardrailState((current) => ({ ...current, min_impressions: value }))}
                inputMode="numeric"
                min={0}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary flex items-center gap-2"
                onClick={() => updateMutation.mutate()}
                disabled={!isDirty || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden={true} />
                    {t('migrationStudio.detail.saveGuardrailsCta')}
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-outline flex items-center gap-2"
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
              >
                {evaluateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden={true} />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden={true} />
                )}
                {evaluateMutation.isPending
                  ? t('migrationStudio.actions.evaluateInFlight')
                  : t('migrationStudio.actions.evaluate')}
              </button>
              {guardrailResult && (
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    guardrailResult.shouldPause
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {guardrailResult.shouldPause ? (
                    <AlertTriangle className="h-4 w-4" aria-hidden={true} />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
                  )}
                  <div>
                    <p className="font-medium">
                      {guardrailResult.shouldPause
                        ? t('migrationStudio.messages.guardrailPaused')
                        : t('migrationStudio.messages.guardrailPassed')}
                    </p>
                    {guardrailResult.violations.length > 0 && (
                      <ul className="mt-2 list-disc pl-4 text-xs">
                        {guardrailResult.violations.map((violation) => (
                          <li key={violation}>{violation}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('migrationStudio.detail.nextStepsHeading')}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {t('migrationStudio.detail.nextStepsCopy')}
            </p>
          </div>
          <Link href="/migration-studio" className="btn btn-outline flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" aria-hidden={true} />
            {t('migrationStudio.detail.backToOverview')}
          </Link>
        </section>
          </div>
        </section>
      </main>
    </div>
  )
}

function GuardrailField({
  label,
  suffix,
  value,
  min,
  step,
  onChange,
  inputMode,
}: {
  label: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  min?: number
  step?: string
  value: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
          type="number"
        <input
          step={step}
          min={min}
          inputMode={inputMode}
          pattern="[0-9,.]*"
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-sm text-gray-500">{suffix}</span>
      </div>
    </label>
  )
}
