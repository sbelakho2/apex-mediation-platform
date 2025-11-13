"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, UploadCloud, Radio, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { migrationApi } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate, t } from '@/i18n'
import type {
  MigrationImportResponse,
  MigrationImportSource,
  MigrationMapping,
  MigrationMappingUpdateResponse,
} from '@/types'

type WizardStep = 'source' | 'review' | 'success'

type ImportWizardProps = {
  placementId: string
  onClose: () => void
  onCompleted?: () => void
}

type PendingAssignments = Record<string, string>

type ApiCredentialsState = {
  apiKey: string
  accountId: string
}

const sourceOptions: Array<{ value: MigrationImportSource; title: string; description: string }> = [
  {
    value: 'csv',
    title: t('migrationStudio.import.sources.csv.title'),
    description: t('migrationStudio.import.sources.csv.description'),
  },
  {
    value: 'ironSource',
    title: t('migrationStudio.import.sources.ironSource.title'),
    description: t('migrationStudio.import.sources.ironSource.description'),
  },
  {
    value: 'applovin',
    title: t('migrationStudio.import.sources.applovin.title'),
    description: t('migrationStudio.import.sources.applovin.description'),
  },
]

export function ImportWizard({ placementId, onClose, onCompleted }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('source')
  const [source, setSource] = useState<MigrationImportSource>('csv')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [apiCredentials, setApiCredentials] = useState<ApiCredentialsState>({ apiKey: '', accountId: '' })
  const [importResult, setImportResult] = useState<MigrationImportResponse | null>(null)
  const [assignments, setAssignments] = useState<PendingAssignments>({})
  const [stepError, setStepError] = useState<string | null>(null)

  const dismiss = useCallback(() => {
    setStep('source')
    setSource('csv')
    setSelectedFile(null)
    setApiCredentials({ apiKey: '', accountId: '' })
    setImportResult(null)
    setAssignments({})
    setStepError(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dismiss])

  useEffect(() => {
    if (!importResult) return
    const defaults: PendingAssignments = {}
    importResult.mappings.forEach((mapping) => {
      defaults[mapping.id] = mapping.our_adapter_id ?? ''
    })
    setAssignments(defaults)
  }, [importResult?.import_id])

  const importMutation = useMutation({
    mutationFn: async () => {
      setStepError(null)
      if (!placementId) throw new Error(t('migrationStudio.import.errors.missingPlacement'))
      if (source === 'csv' && !selectedFile) {
        throw new Error(t('migrationStudio.import.errors.fileRequired'))
      }

      const result = await migrationApi.createImport({
        placementId,
        source,
        file: selectedFile ?? undefined,
        credentials:
          source === 'csv'
            ? undefined
            : {
                api_key: apiCredentials.apiKey,
                account_id: apiCredentials.accountId,
              },
      })

      setImportResult(result)
      setStep('review')
      return result
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t('migrationStudio.import.errors.generic')
      setStepError(message)
    },
  })

  const persistAssignments = useCallback(
    async (requireComplete: boolean) => {
      if (!importResult) return

      if (requireComplete) {
        const unresolved = importResult.mappings.filter((mapping) => !assignments[mapping.id]?.trim())
        if (unresolved.length > 0) {
          throw new Error(t('migrationStudio.import.errors.unresolvedMappings', { count: unresolved.length }))
        }
      }

      const updates: Array<Promise<MigrationMappingUpdateResponse>> = []
      importResult.mappings.forEach((mapping) => {
        const desiredAdapter = assignments[mapping.id]
        const normalized = desiredAdapter?.trim() ?? ''
        if (normalized && normalized !== mapping.our_adapter_id) {
          updates.push(
            migrationApi.updateMapping({
              mappingId: mapping.id,
              ourAdapterId: normalized,
            })
          )
        }
      })

      if (updates.length > 0) {
        const results = await Promise.all(updates)
        setImportResult((current) => {
          if (!current) return current
          const updatesById = new Map(results.map((result) => [result.mapping.id, result]))
          const updatedMappings = current.mappings.map((mapping) => {
            const update = updatesById.get(mapping.id)
            return update ? update.mapping : mapping
          })
          const latestSummary = results[results.length - 1]?.summary ?? current.summary
          return {
            ...current,
            mappings: updatedMappings,
            summary: latestSummary,
          }
        })
      }
    },
    [assignments, importResult]
  )

  const saveAssignmentsMutation = useMutation({
    mutationFn: async () => {
      setStepError(null)
      await persistAssignments(false)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t('migrationStudio.import.errors.generic')
      setStepError(message)
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!importResult) return
      setStepError(null)
      await persistAssignments(true)
      const finalized = await migrationApi.finalizeImport(importResult.import_id)
      setImportResult(finalized)
      setStep('success')
      onCompleted?.()
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t('migrationStudio.import.errors.generic')
      setStepError(message)
    },
  })

  const summaryCards = useMemo(() => {
    if (!importResult?.summary) return null
    return [
      {
        label: t('migrationStudio.import.summary.total'),
        value: importResult.summary.total_mappings,
      },
      {
        label: t('migrationStudio.import.summary.confirmed'),
        value: importResult.summary.status_breakdown.confirmed ?? 0,
      },
      {
        label: t('migrationStudio.import.summary.pending'),
        value: importResult.summary.status_breakdown.pending ?? 0,
      },
      {
        label: t('migrationStudio.import.summary.conflicts'),
        value: importResult.summary.status_breakdown.conflict ?? 0,
      },
      {
        label: t('migrationStudio.import.summary.networks'),
        value: importResult.summary.unique_networks ?? 0,
      },
    ]
  }, [importResult?.summary])

  const stepIndex = step === 'source' ? 0 : step === 'review' ? 1 : 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" role="presentation" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-import-title"
        className="relative z-50 w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <header className="flex items-center justify-between border-b px-6 py-4 bg-gray-50">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-600">
              {t('migrationStudio.import.headingEyebrow')}
            </p>
            <h2 id="migration-import-title" className="text-xl font-semibold text-gray-900">
              {t('migrationStudio.import.heading')}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label={t('migrationStudio.import.actions.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="px-6 pt-4 pb-2">
          <ol className="flex items-center gap-3 text-xs font-medium text-gray-500">
            {[t('migrationStudio.import.steps.source'), t('migrationStudio.import.steps.review'), t('migrationStudio.import.steps.complete')].map(
              (label, index) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                      index <= stepIndex ? 'border-primary-600 bg-primary-50 text-primary-600' : 'border-gray-300 text-gray-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={index === stepIndex ? 'text-gray-900' : ''}>{label}</span>
                  {index < 2 && <span className="mx-2 h-px w-6 bg-gray-200" aria-hidden="true" />}
                </li>
              )
            )}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {stepError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 mt-0.5" aria-hidden="true" />
              <p>{stepError}</p>
            </div>
          )}

          {step === 'source' && (
            <SourceStep
              source={source}
              onSourceChange={setSource}
              selectedFile={selectedFile}
              onFileSelected={setSelectedFile}
              apiCredentials={apiCredentials}
              onCredentialsChange={setApiCredentials}
              onSubmit={() => importMutation.mutate()}
              isSubmitting={importMutation.isPending}
            />
          )}

          {step === 'review' && importResult && (
            <ReviewStep
              importResult={importResult}
              assignments={assignments}
              onAssignmentsChange={setAssignments}
              onSave={() => saveAssignmentsMutation.mutate()}
              onFinalize={() => finalizeMutation.mutate()}
              isSaving={saveAssignmentsMutation.isPending}
              isFinalizing={finalizeMutation.isPending}
              summaryCards={summaryCards}
            />
          )}

          {step === 'success' && importResult && (
            <SuccessStep importResult={importResult} onClose={dismiss} />
          )}
        </div>
      </div>
    </div>
  )
}

type SourceStepProps = {
  source: MigrationImportSource
  onSourceChange: (value: MigrationImportSource) => void
  selectedFile: File | null
  onFileSelected: (file: File | null) => void
  apiCredentials: ApiCredentialsState
  onCredentialsChange: (value: ApiCredentialsState) => void
  onSubmit: () => void
  isSubmitting: boolean
}

function SourceStep({
  source,
  onSourceChange,
  selectedFile,
  onFileSelected,
  apiCredentials,
  onCredentialsChange,
  onSubmit,
  isSubmitting,
}: SourceStepProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="space-y-6"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {sourceOptions.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-xl border p-4 transition hover:border-primary-500 hover:shadow-sm ${
              source === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="migration-import-source"
              value={option.value}
              checked={source === option.value}
              onChange={() => onSourceChange(option.value)}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <Radio className="h-5 w-5 text-primary-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-gray-900">{option.title}</p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{option.description}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      {source === 'csv' ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <UploadCloud className="mx-auto h-10 w-10 text-primary-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {t('migrationStudio.import.csv.uploadPrompt')}
          </p>
          <p className="mt-1 text-xs text-gray-500">{t('migrationStudio.import.csv.hint')}</p>
          <div className="mt-4">
            <label className="inline-flex items-center justify-center rounded-lg border border-primary-500 bg-white px-4 py-2 text-sm font-semibold text-primary-600 shadow-sm hover:bg-primary-50">
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  onFileSelected(file ?? null)
                }}
              />
              {t('migrationStudio.import.csv.chooseFile')}
            </label>
          </div>
          {selectedFile && (
            <p className="mt-3 text-xs text-gray-600">
              {t('migrationStudio.import.csv.selectedFile', { name: selectedFile.name })}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('migrationStudio.import.api.apiKeyLabel')}
            </label>
            <input
              type="text"
              value={apiCredentials.apiKey}
              onChange={(event) => onCredentialsChange({ ...apiCredentials, apiKey: event.target.value })}
              className="input mt-1 w-full"
              placeholder={t('migrationStudio.import.api.apiKeyPlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('migrationStudio.import.api.accountLabel')}
            </label>
            <input
              type="text"
              value={apiCredentials.accountId}
              onChange={(event) => onCredentialsChange({ ...apiCredentials, accountId: event.target.value })}
              className="input mt-1 w-full"
              placeholder={t('migrationStudio.import.api.accountPlaceholder')}
              required
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            onFileSelected(null)
            if (source !== 'csv') {
              onCredentialsChange({ apiKey: '', accountId: '' })
            }
          }}
          className="btn btn-outline"
        >
          {t('migrationStudio.import.actions.reset')}
        </button>
        <button
          type="submit"
          className="btn btn-primary flex items-center gap-2"
          disabled={isSubmitting}
        >
          {isSubmitting && <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />}
          {t('migrationStudio.import.actions.continue')}
        </button>
      </div>
    </form>
  )
}

type ReviewStepProps = {
  importResult: MigrationImportResponse
  assignments: PendingAssignments
  onAssignmentsChange: (value: PendingAssignments) => void
  onSave: () => void
  onFinalize: () => void
  isSaving: boolean
  isFinalizing: boolean
  summaryCards: Array<{ label: string; value: number }> | null
}

function ReviewStep({
  importResult,
  assignments,
  onAssignmentsChange,
  onSave,
  onFinalize,
  isSaving,
  isFinalizing,
  summaryCards,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-900">
          {t('migrationStudio.import.review.metaTitle')}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {t('migrationStudio.import.review.metaSubtitle', {
            placement: importResult.placement_id ?? '—',
            timestamp: formatDate(importResult.created_at),
          })}
        </p>
        {summaryCards && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-5">
            {summaryCards.map((item) => (
              <div key={item.label} className="rounded-lg bg-white p-3 text-center shadow-sm">
                <dd className="text-2xl font-semibold text-gray-900">{item.value}</dd>
                <dt className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{item.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('migrationStudio.import.review.columns.incumbent')}
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('migrationStudio.import.review.columns.details')}
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('migrationStudio.import.review.columns.match')}
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('migrationStudio.import.review.columns.status')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {importResult.mappings.map((mapping) => (
              <tr key={mapping.id} className="align-top">
                <td className="px-4 py-4 text-sm text-gray-900">
                  <p className="font-semibold">{mapping.incumbent_instance_name ?? mapping.incumbent_instance_id}</p>
                  <p className="text-xs text-gray-500 mt-1">{mapping.incumbent_network}</p>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  <div className="space-y-1">
                    {typeof mapping.incumbent_waterfall_position === 'number' && (
                      <p>{t('migrationStudio.import.review.fields.position', { position: mapping.incumbent_waterfall_position })}</p>
                    )}
                    {typeof mapping.incumbent_ecpm_cents === 'number' && mapping.incumbent_ecpm_cents > 0 && (
                      <p>{t('migrationStudio.import.review.fields.ecpm', { value: (mapping.incumbent_ecpm_cents / 100).toFixed(2) })}</p>
                    )}
                    {mapping.mapping_confidence && (
                      <p>{t('migrationStudio.import.review.fields.confidence', { level: mapping.mapping_confidence })}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('migrationStudio.import.review.fields.adapterLabel')}
                  </label>
                  <input
                    type="text"
                    value={assignments[mapping.id] ?? ''}
                    onChange={(event) =>
                      onAssignmentsChange({
                        ...assignments,
                        [mapping.id]: event.target.value,
                      })
                    }
                    className="input w-full"
                    placeholder={t('migrationStudio.import.review.fields.adapterPlaceholder')}
                  />
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      mapping.mapping_status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : mapping.mapping_status === 'conflict'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {mapping.mapping_status}
                  </span>
                  {mapping.conflict_reason && (
                    <p className="mt-2 text-xs text-gray-500">{mapping.conflict_reason}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">
          {t('migrationStudio.import.review.helperText')}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-outline flex items-center gap-2"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving && <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />}
            {t('migrationStudio.import.review.actions.saveDraft')}
          </button>
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={onFinalize}
            disabled={isFinalizing}
          >
            {isFinalizing && <Spinner size="sm" label={t('migrationStudio.import.actions.loading')} />}
            {t('migrationStudio.import.actions.finalize')}
          </button>
        </div>
      </div>
    </div>
  )
}

type SuccessStepProps = {
  importResult: MigrationImportResponse
  onClose: () => void
}

function SuccessStep({ importResult, onClose }: SuccessStepProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold text-gray-900">
        {t('migrationStudio.import.success.title')}
      </h3>
      <p className="mt-3 text-sm text-gray-600 max-w-md">
        {t('migrationStudio.import.success.description', {
          placement: importResult.placement_id ?? '—',
        })}
      </p>
      <button type="button" className="btn btn-primary mt-8" onClick={onClose}>
        {t('migrationStudio.import.success.dismiss')}
      </button>
    </div>
  )
}

export default ImportWizard
