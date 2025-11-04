'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'
import { ArrowLeft, Save, ShieldAlert, AlertCircle, CheckCircle } from 'lucide-react'

const fraudSchema = z.object({
  alertEmails: z.string().trim().min(1, 'At least one alert email is required'),
  warningThreshold: z.coerce.number().min(0).max(1),
  blockThreshold: z.coerce.number().min(0).max(1),
  autoBlock: z.boolean(),
  webhookUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
})

type FraudFormValues = z.infer<typeof fraudSchema>

export default function FraudSettingsPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'fraud'],
    queryFn: async () => {
      const { data } = await settingsApi.getFraudSettings()
      return data
    },
  })

  const form = useForm<FraudFormValues>({
    resolver: zodResolver(fraudSchema),
    defaultValues: {
      alertEmails: '',
      warningThreshold: 0.02,
      blockThreshold: 0.05,
      autoBlock: true,
      webhookUrl: '',
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        alertEmails: data.alertEmails.join(', '),
        warningThreshold: data.warningThreshold,
        blockThreshold: data.blockThreshold,
        autoBlock: data.autoBlock,
        webhookUrl: data.webhookUrl ?? '',
      })
    }
  }, [data, form])

  const updateMutation = useMutation({
    mutationFn: async (values: FraudFormValues) => {
      const payload = {
        alertEmails: values.alertEmails.split(',').map((email) => email.trim()).filter(Boolean),
        warningThreshold: values.warningThreshold,
        blockThreshold: values.blockThreshold,
        autoBlock: values.autoBlock,
        webhookUrl: values.webhookUrl || undefined,
      }
      await settingsApi.updateFraudSettings(payload)
    },
    onMutate: () => setMessage(null),
    onSuccess: () => setMessage({ type: 'success', text: 'Fraud settings updated successfully.' }),
    onError: () => setMessage({ type: 'error', text: 'Failed to update fraud settings. Please try again.' }),
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Back to Settings
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6" aria-hidden={true} />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-600">Fraud Protection</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Fraud & Quality Settings</h1>
              <p className="text-sm text-gray-600 mt-1">
                Define thresholds and escalation channels to keep traffic clean without sacrificing revenue.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))} className="space-y-6">
          {message && (
            <div
              className={`card flex items-start gap-3 ${
                message.type === 'success'
                  ? 'bg-success-50 border-success-200'
                  : 'bg-danger-50 border-danger-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-success-600 mt-0.5" aria-hidden={true} />
              ) : (
                <AlertCircle className="h-5 w-5 text-danger-600 mt-0.5" aria-hidden={true} />
              )}
              <p className="text-sm text-gray-700">{message.text}</p>
            </div>
          )}

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alerting</h2>
              <p className="text-sm text-gray-600">
                Choose who gets notified when fraud indicators spike beyond safe thresholds.
              </p>
            </div>
            <div>
              <label htmlFor="alertEmails" className="label">
                Alert Recipients
              </label>
              <textarea
                id="alertEmails"
                rows={3}
                className="input min-h-[100px]"
                placeholder="fraud@example.com, ops@example.com"
                {...form.register('alertEmails')}
              />
              {form.formState.errors.alertEmails && (
                <p className="text-sm text-danger-600 mt-1">{form.formState.errors.alertEmails.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas.</p>
            </div>
            <div>
              <label htmlFor="webhookUrl" className="label">
                Webhook URL
              </label>
              <input id="webhookUrl" type="url" className="input" placeholder="https://example.com/fraud-webhook" {...form.register('webhookUrl')} />
              {form.formState.errors.webhookUrl && (
                <p className="text-sm text-danger-600 mt-1">{form.formState.errors.webhookUrl.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Optional. Receive JSON payloads whenever thresholds are breached.
              </p>
            </div>
          </section>

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Thresholds</h2>
              <p className="text-sm text-gray-600">
                Configure warning and block percentages for invalid traffic (fraud rate).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="warningThreshold" className="label">
                  Warning Threshold (0 - 1)
                </label>
                <input id="warningThreshold" type="number" step="0.001" className="input" {...form.register('warningThreshold')} />
                {form.formState.errors.warningThreshold && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.warningThreshold.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Trigger alerts when fraud rate exceeds this value.</p>
              </div>
              <div>
                <label htmlFor="blockThreshold" className="label">
                  Block Threshold (0 - 1)
                </label>
                <input id="blockThreshold" type="number" step="0.001" className="input" {...form.register('blockThreshold')} />
                {form.formState.errors.blockThreshold && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.blockThreshold.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Traffic above this level is automatically blocked (if enabled).</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input id="autoBlock" type="checkbox" className="h-4 w-4 accent-primary-600" {...form.register('autoBlock')} />
              <label htmlFor="autoBlock" className="text-sm text-gray-700">
                Automatically block placements exceeding block threshold
              </label>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            <Link href="/settings" className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
              disabled={updateMutation.isPending || isLoading}
            >
              <Save className="h-4 w-4" aria-hidden={true} />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
