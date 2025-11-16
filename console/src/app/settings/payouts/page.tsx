'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'
import { ArrowLeft, Banknote, Save, AlertCircle, CheckCircle } from 'lucide-react'

const payoutSchema = z
  .object({
    method: z.enum(['stripe', 'paypal', 'wire'], { required_error: 'Select a payout method' }),
    accountName: z
      .string()
      .trim()
      .min(1, 'Account name is required')
      .max(100, 'Account name is too long'),
    accountNumberMasked: z
      .string()
      .trim()
      .min(4, 'Account reference is required')
      .regex(/^[A-Za-z0-9*\-\s]+$/, 'Use only letters, numbers, spaces, dashes, or *'),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/i, 'Currency must be a 3-letter ISO code (e.g., USD, EUR)')
      .transform((s) => s.toUpperCase()),
    minimumPayout: z.coerce.number().min(0, 'Minimum payout must be >= 0'),
    autoPayout: z.boolean(),
    backupMethod: z.union([z.enum(['stripe', 'paypal', 'wire']), z.literal('')]).optional(),
  })
  .refine(
    (v) => {
      const backupValue = typeof v.backupMethod === 'string' ? v.backupMethod : ''
      const backup = backupValue.length > 0 ? backupValue : undefined
      if (!backup) return true
      return backup !== v.method
    },
    { path: ['backupMethod'], message: 'Backup method must differ from primary method' }
  )

type PayoutFormValues = z.infer<typeof payoutSchema>

export default function PayoutSettingsPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const { data, isLoading } = useQuery({
  queryKey: ['settings', 'payout'],
    queryFn: async () => {
      const { data } = await settingsApi.getPayoutSettings()
      return data
    },
  })

  const form = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
    mode: 'onChange',
    defaultValues: {
      method: 'wire',
      accountName: '',
      accountNumberMasked: '',
      currency: 'USD',
      minimumPayout: 100,
      autoPayout: false,
      backupMethod: '',
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        method: data.method,
        accountName: data.accountName,
        accountNumberMasked: data.accountNumberMasked,
        currency: data.currency,
        minimumPayout: data.minimumPayout,
        autoPayout: data.autoPayout,
        backupMethod: data.backupMethod ?? '',
      })
    }
  }, [data, form])

  const updateMutation = useMutation({
    mutationFn: async (values: PayoutFormValues) => {
      await settingsApi.updatePayoutSettings({
        method: values.method,
        accountName: values.accountName,
        accountNumberMasked: values.accountNumberMasked,
        currency: values.currency,
        minimumPayout: values.minimumPayout,
        autoPayout: values.autoPayout,
        backupMethod: values.backupMethod || undefined,
      })
    },
    onMutate: () => setMessage(null),
    onSuccess: () => {
      setShowConfirm(false)
      setMessage({ type: 'success', text: 'Payout settings updated successfully.' })
    },
    onError: () => setMessage({ type: 'error', text: 'Failed to update payout settings. Please try again.' }),
  })

  // Derived flag: can confirm only when valid and not pending
  const canConfirm = useMemo(() => form.formState.isValid && !updateMutation.isPending, [form.formState.isValid, updateMutation.isPending])

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
              <Banknote className="h-6 w-6" aria-hidden={true} />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-600">Finance</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Payouts & Billing</h1>
              <p className="text-sm text-gray-600 mt-1">
                Set payment thresholds, terms, and invoicing preferences so finance can reconcile quickly.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form
          onSubmit={form.handleSubmit(() => {
            // Open confirmation modal instead of immediate submit
            setShowConfirm(true)
          })}
          className="space-y-6"
        >
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
              <h2 className="text-lg font-semibold text-gray-900">Primary Method</h2>
              <p className="text-sm text-gray-600">
                Choose how we send funds and confirm the receiving account details.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['stripe', 'paypal', 'wire'].map((option) => (
                <label
                  key={option}
                  className={`card cursor-pointer border transition ${
                    form.watch('method') === option ? 'border-primary-500 ring-2 ring-primary-100' : ''
                  }`}
                >
                  <input
                    type="radio"
                    value={option}
                    className="sr-only"
                    {...form.register('method')}
                  />
                  <p className="text-sm font-semibold capitalize text-gray-900">{option}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {option === 'wire'
                      ? 'Traditional bank transfer for large balances.'
                      : option === 'stripe'
                      ? 'Fast payouts to connected Stripe account.'
                      : 'Send to a verified PayPal business account.'}
                  </p>
                </label>
              ))}
            </div>
            {form.formState.errors.method && (
              <p className="text-sm text-danger-600">{form.formState.errors.method.message}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="accountName" className="label">
                  Account Name
                </label>
                <input id="accountName" type="text" className="input" {...form.register('accountName')} />
                {form.formState.errors.accountName && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.accountName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="accountNumberMasked" className="label">
                  Account Reference
                </label>
                <input
                  id="accountNumberMasked"
                  type="text"
                  className="input"
                  placeholder="•••• 1234"
                  {...form.register('accountNumberMasked')}
                />
                {form.formState.errors.accountNumberMasked && (
                  <p className="text-sm text-danger-600 mt-1">
                    {form.formState.errors.accountNumberMasked.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Tokenized identifier we can show in UI and emails.</p>
              </div>
            </div>
          </section>

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payment Rules</h2>
              <p className="text-sm text-gray-600">
                Control when payouts trigger and provide a backup method if automation fails.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="minimumPayout" className="label">
                  Minimum Payout
                </label>
                <input id="minimumPayout" type="number" step="0.01" className="input" {...form.register('minimumPayout')} />
                {form.formState.errors.minimumPayout && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.minimumPayout.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">We&apos;ll only issue payouts when your balance exceeds this amount.</p>
              </div>
              <div>
                <label htmlFor="currency" className="label">
                  Settlement Currency
                </label>
                <input id="currency" type="text" className="input" placeholder="USD" {...form.register('currency')} />
                {form.formState.errors.currency && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.currency.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input id="autoPayout" type="checkbox" className="h-4 w-4 accent-primary-600" {...form.register('autoPayout')} />
              <label htmlFor="autoPayout" className="text-sm text-gray-700">
                Automatically send payouts when the minimum threshold is met
              </label>
            </div>
            <div>
              <label htmlFor="backupMethod" className="label">
                Backup Method (Optional)
              </label>
              <select id="backupMethod" className="input" {...form.register('backupMethod')}>
                <option value="">None</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="wire">Wire</option>
              </select>
              {form.formState.errors.backupMethod && (
                <p className="text-sm text-danger-600 mt-1">{form.formState.errors.backupMethod.message}</p>
              )}
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

        {/* Confirmation Modal */}
        {showConfirm && (
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-50 flex items-center justify-center">
            <button
              type="button"
              aria-label="Dismiss confirmation dialog"
              className="absolute inset-0 bg-black/30"
              onClick={() => setShowConfirm(false)}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
              <h3 id="confirm-title" className="text-lg font-semibold text-gray-900">Confirm sensitive account changes</h3>
              <p className="text-sm text-gray-600 mt-2">
                You are about to update payout banking details. This may affect future disbursements. Please confirm you wish to save these changes.
              </p>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button type="button" className="btn btn-outline" onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canConfirm}
                  onClick={form.handleSubmit((values) => updateMutation.mutate(values))}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
