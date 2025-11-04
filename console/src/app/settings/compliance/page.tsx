'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'
import { ArrowLeft, Globe, Shield, Save, AlertCircle, CheckCircle } from 'lucide-react'
import type { ComplianceSettings } from '@/types'

const complianceSchema = z.object({
  gdprEnabled: z.boolean(),
  ccpaEnabled: z.boolean(),
  coppaMode: z.boolean(),
  consentProvider: z.enum(['custom', 'onetrust', 'cookiebot']).optional().or(z.literal('')),
  autoBlock: z.boolean(),
  consentString: z.string().optional().or(z.literal('')),
  rawEventsDays: z.coerce.number().min(1).max(365),
  aggregatedDataDays: z.coerce.number().min(1).max(730),
  userDataDays: z.coerce.number().min(1).max(90),
  euTrafficOnly: z.boolean(),
  blockedCountries: z.string(),
  sensitiveCategories: z.string(),
})

type ComplianceFormValues = z.infer<typeof complianceSchema>

export default function ComplianceSettingsPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'compliance'],
    queryFn: async () => {
      const { data } = await settingsApi.getComplianceSettings()
      return data
    },
  })

  const form = useForm<ComplianceFormValues>({
    resolver: zodResolver(complianceSchema),
    defaultValues: {
      gdprEnabled: false,
      ccpaEnabled: false,
      coppaMode: false,
      consentProvider: '',
      autoBlock: true,
      consentString: '',
      rawEventsDays: 30,
      aggregatedDataDays: 365,
      userDataDays: 30,
      euTrafficOnly: false,
      blockedCountries: '',
      sensitiveCategories: '',
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        gdprEnabled: data.gdprEnabled,
        ccpaEnabled: data.ccpaEnabled,
        coppaMode: data.coppaMode,
        consentProvider: data.consentManagement.provider ?? '',
        autoBlock: data.consentManagement.autoBlock,
        consentString: data.consentManagement.consentString ?? '',
        rawEventsDays: data.dataRetention.rawEventsDays,
        aggregatedDataDays: data.dataRetention.aggregatedDataDays,
        userDataDays: data.dataRetention.userDataDays,
        euTrafficOnly: data.regionalSettings.euTrafficOnly,
        blockedCountries: data.regionalSettings.blockedCountries.join(', '),
        sensitiveCategories: data.regionalSettings.sensitiveCategories.join(', '),
      })
    }
  }, [data, form])

  const updateMutation = useMutation({
    mutationFn: async (values: ComplianceFormValues) => {
      await settingsApi.updateComplianceSettings({
        gdprEnabled: values.gdprEnabled,
        ccpaEnabled: values.ccpaEnabled,
        coppaMode: values.coppaMode,
        consentManagement: {
          provider: values.consentProvider || undefined,
          autoBlock: values.autoBlock,
          consentString: values.consentString || undefined,
        },
        dataRetention: {
          rawEventsDays: values.rawEventsDays,
          aggregatedDataDays: values.aggregatedDataDays,
          userDataDays: values.userDataDays,
        },
        regionalSettings: {
          euTrafficOnly: values.euTrafficOnly,
          blockedCountries: values.blockedCountries.split(',').map((c) => c.trim()).filter(Boolean),
          sensitiveCategories: values.sensitiveCategories.split(',').map((c) => c.trim()).filter(Boolean),
        },
      })
    },
    onMutate: () => setMessage(null),
    onSuccess: () => setMessage({ type: 'success', text: 'Compliance settings updated successfully.' }),
    onError: () => setMessage({ type: 'error', text: 'Failed to update compliance settings. Please try again.' }),
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
              <Globe className="h-6 w-6" aria-hidden={true} />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-600">Privacy & Legal</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Regional Compliance</h1>
              <p className="text-sm text-gray-600 mt-1">
                Configure GDPR, CCPA, COPPA protections and manage data retention policies.
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
              <h2 className="text-lg font-semibold text-gray-900">Privacy Frameworks</h2>
              <p className="text-sm text-gray-600">
                Enable region-specific privacy laws that govern how traffic is processed.
              </p>
            </div>
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="mt-1" {...form.register('gdprEnabled')} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">GDPR (EU)</p>
                  <p className="text-xs text-gray-600 mt-1">
                    General Data Protection Regulation. Requires explicit consent, data portability, and right to deletion.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="mt-1" {...form.register('ccpaEnabled')} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">CCPA (California)</p>
                  <p className="text-xs text-gray-600 mt-1">
                    California Consumer Privacy Act. Grants users right to opt out of data sales and see collected data.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="mt-1" {...form.register('coppaMode')} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">COPPA (Children)</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Children&apos;s Online Privacy Protection Act. Restricts ad targeting for users under 13.
                  </p>
                </div>
              </label>
            </div>
          </section>

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Consent Management</h2>
              <p className="text-sm text-gray-600">
                Integrate with a CMP or handle consent strings manually to comply with privacy laws.
              </p>
            </div>
            <div>
              <label htmlFor="consentProvider" className="label">
                Consent Provider (Optional)
              </label>
              <select id="consentProvider" className="input" {...form.register('consentProvider')}>
                <option value="">Custom / Manual</option>
                <option value="onetrust">OneTrust</option>
                <option value="cookiebot">Cookiebot</option>
              </select>
            </div>
            <div>
              <label htmlFor="consentString" className="label">
                IAB Consent String (Optional)
              </label>
              <input
                id="consentString"
                type="text"
                className="input"
                placeholder="CPXs..."
                {...form.register('consentString')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank if using a CMP that injects the string automatically.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input id="autoBlock" type="checkbox" className="h-4 w-4 accent-primary-600" {...form.register('autoBlock')} />
              <label htmlFor="autoBlock" className="text-sm text-gray-700">
                Automatically block ad requests when consent is not granted
              </label>
            </div>
          </section>

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Data Retention</h2>
              <p className="text-sm text-gray-600">
                Define how long different data types are retained before automatic deletion.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="rawEventsDays" className="label">
                  Raw Events (Days)
                </label>
                <input id="rawEventsDays" type="number" className="input" {...form.register('rawEventsDays')} />
                {form.formState.errors.rawEventsDays && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.rawEventsDays.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="aggregatedDataDays" className="label">
                  Aggregated Data (Days)
                </label>
                <input id="aggregatedDataDays" type="number" className="input" {...form.register('aggregatedDataDays')} />
                {form.formState.errors.aggregatedDataDays && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.aggregatedDataDays.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="userDataDays" className="label">
                  User Data (Days)
                </label>
                <input id="userDataDays" type="number" className="input" {...form.register('userDataDays')} />
                {form.formState.errors.userDataDays && (
                  <p className="text-sm text-danger-600 mt-1">{form.formState.errors.userDataDays.message}</p>
                )}
              </div>
            </div>
          </section>

          <section className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Regional Restrictions</h2>
              <p className="text-sm text-gray-600">
                Limit which geographies can access your inventory and block sensitive ad categories.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input id="euTrafficOnly" type="checkbox" className="h-4 w-4 accent-primary-600" {...form.register('euTrafficOnly')} />
              <label htmlFor="euTrafficOnly" className="text-sm text-gray-700">
                Only serve ads to EU/EEA traffic (strict GDPR enforcement)
              </label>
            </div>
            <div>
              <label htmlFor="blockedCountries" className="label">
                Blocked Countries
              </label>
              <input
                id="blockedCountries"
                type="text"
                className="input"
                placeholder="RU, CN, KP"
                {...form.register('blockedCountries')}
              />
              <p className="text-xs text-gray-500 mt-1">
                ISO country codes separated by commas. Traffic from these regions will be rejected.
              </p>
            </div>
            <div>
              <label htmlFor="sensitiveCategories" className="label">
                Blocked Ad Categories
              </label>
              <input
                id="sensitiveCategories"
                type="text"
                className="input"
                placeholder="gambling, alcohol, dating"
                {...form.register('sensitiveCategories')}
              />
              <p className="text-xs text-gray-500 mt-1">
                IAB categories or custom keywords. Ads matching these will be automatically filtered.
              </p>
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
