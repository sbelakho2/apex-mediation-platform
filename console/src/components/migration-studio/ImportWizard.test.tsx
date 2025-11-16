import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ImportWizard from './ImportWizard'
import type { MigrationImportResponse } from '@/types'

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    migrationApi: {
      listExperiments: actual.migrationApi.listExperiments,
      getExperiment: actual.migrationApi.getExperiment,
      createImport: jest.fn(),
      updateMapping: jest.fn(),
      finalizeImport: jest.fn(),
    },
  }
})

const { migrationApi } = require('@/lib/api') as {
  migrationApi: {
    createImport: jest.Mock
    updateMapping: jest.Mock
    finalizeImport: jest.Mock
  }
}

const mockResponse = (overrides?: Partial<MigrationImportResponse>): MigrationImportResponse => {
  const response: MigrationImportResponse = {
    import_id: 'import-1',
    placement_id: 'placement-1',
    source: 'csv',
    status: 'pending_review',
    created_at: new Date().toISOString(),
    experiment_id: 'exp-1',
    summary: {
      total_mappings: 1,
      status_breakdown: {
        pending: 1,
        confirmed: 0,
        skipped: 0,
        conflict: 0,
      },
      confidence_breakdown: {
        high: 0,
        medium: 1,
        low: 0,
      },
      unique_networks: 1,
    },
    mappings: [
      {
        id: 'map-1',
        experiment_id: 'exp-1',
        incumbent_network: 'ironSource',
        incumbent_instance_id: 'instance-1',
        incumbent_instance_name: 'ironSource Rewarded',
        incumbent_waterfall_position: 1,
        incumbent_ecpm_cents: 235,
        mapping_status: 'pending',
        mapping_confidence: 'medium',
        our_adapter_id: '',
        our_adapter_name: undefined,
        conflict_reason: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  }

  if (overrides?.summary) {
    response.summary = {
      ...response.summary,
      ...overrides.summary,
      status_breakdown: {
        ...response.summary.status_breakdown,
        ...overrides.summary.status_breakdown,
      },
      confidence_breakdown: {
        ...response.summary.confidence_breakdown,
        ...overrides.summary.confidence_breakdown,
      },
    }
  }

  const overridesWithoutSummary = { ...overrides }
  if (overridesWithoutSummary.summary) {
    delete overridesWithoutSummary.summary
  }

  return {
    ...response,
    ...overridesWithoutSummary,
  }
}

describe('ImportWizard', () => {
  const createWrapper = (ui: React.ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const uploadCsvAndAdvance = async () => {
    const file = new File(['id,instance'], 'import.csv', { type: 'text/csv' })
    const fileInput = screen.getByLabelText(/choose csv/i)
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(migrationApi.createImport).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/review detected mappings/i)).toBeInTheDocument())
  }

  it('uploads CSV and finalizes mappings', async () => {
    const onCompleted = jest.fn()
    migrationApi.createImport.mockResolvedValue(mockResponse())
    migrationApi.updateMapping.mockResolvedValue({
      mapping: {
        ...mockResponse().mappings[0],
        our_adapter_id: 'adapter-123',
        mapping_status: 'confirmed',
      },
      summary: {
        total_mappings: 1,
        status_breakdown: {
          pending: 0,
          confirmed: 1,
          skipped: 0,
          conflict: 0,
        },
        confidence_breakdown: {
          high: 0,
          medium: 1,
          low: 0,
        },
        unique_networks: 1,
      },
    })
    migrationApi.finalizeImport.mockResolvedValue(
      mockResponse({
        status: 'completed',
        summary: {
          total_mappings: 1,
          status_breakdown: {
            pending: 0,
            confirmed: 1,
            skipped: 0,
            conflict: 0,
          },
          confidence_breakdown: {
            high: 0,
            medium: 1,
            low: 0,
          },
          unique_networks: 1,
        },
      })
    )

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={onCompleted} />
    )

  await uploadCsvAndAdvance()

    const adapterInput = screen.getByPlaceholderText(/apex_sdk_adapter_01/i)
    fireEvent.change(adapterInput, { target: { value: 'adapter-123' } })

    const finalizeButton = screen.getByRole('button', { name: /finalize import/i })
    fireEvent.click(finalizeButton)

    await waitFor(() => expect(migrationApi.updateMapping).toHaveBeenCalledWith({
      mappingId: 'map-1',
      ourAdapterId: 'adapter-123',
    }))
    await waitFor(() => expect(migrationApi.finalizeImport).toHaveBeenCalledWith('import-1'))
    await waitFor(() => expect(onCompleted).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/import ready for activation/i)).toBeInTheDocument())
  })

  it('blocks finalize when assignments are unresolved', async () => {
    migrationApi.createImport.mockResolvedValue(mockResponse())

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    await uploadCsvAndAdvance()

    const finalizeButton = screen.getByRole('button', { name: /finalize import/i })
    fireEvent.click(finalizeButton)

    await waitFor(() =>
      expect(screen.getByText(/Resolve 1 pending mappings before finalizing./i)).toBeInTheDocument()
    )
    expect(migrationApi.finalizeImport).not.toHaveBeenCalled()
  })

  it('allows API connector imports with credentials', async () => {
    migrationApi.createImport.mockResolvedValue(mockResponse({ source: 'ironSource' }))

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    fireEvent.click(screen.getByRole('radio', { name: /ironsource api/i }))

  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'key-123' } })
  fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: 'acct-88' } })

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(migrationApi.createImport).toHaveBeenCalledWith(
        expect.objectContaining({
          placementId: 'placement-1',
          source: 'ironSource',
          credentials: { api_key: 'key-123', account_id: 'acct-88' },
          file: undefined,
        })
      )
    )
  })

  it('surfaces API errors when import fails', async () => {
    migrationApi.createImport.mockRejectedValue(new Error('API offline'))

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    const file = new File(['id,instance'], 'import.csv', { type: 'text/csv' })
    const fileInput = screen.getByLabelText(/choose csv/i)
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByText(/API offline/i)).toBeInTheDocument())
  })

  it('saves assignments without finalizing', async () => {
    migrationApi.createImport.mockResolvedValue(mockResponse())
    migrationApi.updateMapping.mockResolvedValue({
      mapping: {
        ...mockResponse().mappings[0],
        our_adapter_id: 'adapter-temp',
        mapping_status: 'confirmed',
      },
      summary: mockResponse().summary!,
    })

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    await uploadCsvAndAdvance()

    fireEvent.change(screen.getByPlaceholderText(/apex_sdk_adapter_01/i), {
      target: { value: 'adapter-temp' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save progress/i }))

    await waitFor(() =>
      expect(migrationApi.updateMapping).toHaveBeenCalledWith({
        mappingId: 'map-1',
        ourAdapterId: 'adapter-temp',
      })
    )
    expect(migrationApi.finalizeImport).not.toHaveBeenCalled()
  })

  it('reports batch assignment failures', async () => {
    const base = mockResponse()
    const secondMapping = {
      ...base.mappings[0],
      id: 'map-2',
      incumbent_instance_id: 'instance-2',
      incumbent_instance_name: 'ironSource Banner',
    }
    const twoMappings = {
      ...base,
      mappings: [base.mappings[0], secondMapping],
    }

    migrationApi.createImport.mockResolvedValue(twoMappings)
    migrationApi.updateMapping
      .mockRejectedValueOnce(new Error('bad mapping'))
      .mockResolvedValueOnce({
        mapping: twoMappings.mappings[1],
        summary: twoMappings.summary!,
      })

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    await uploadCsvAndAdvance()

    const inputs = screen.getAllByPlaceholderText(/apex_sdk_adapter_01/i)
    fireEvent.change(inputs[0], { target: { value: 'adapter-one' } })
    fireEvent.change(inputs[1], { target: { value: 'adapter-two' } })

    fireEvent.click(screen.getByRole('button', { name: /save progress/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't update 1 mappings/i)
      ).toBeInTheDocument()
    )
  })

  it('shows summary placeholder when metrics missing', async () => {
    const response = mockResponse()
    // remove summary to mimic API response without aggregates
    delete (response as any).summary
    migrationApi.createImport.mockResolvedValue(response as MigrationImportResponse)

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={jest.fn()} onCompleted={jest.fn()} />
    )

    await uploadCsvAndAdvance()

    expect(screen.getByText(/Summary metrics will populate/i)).toBeInTheDocument()
  })

  it('dismisses the wizard on escape', async () => {
    migrationApi.createImport.mockResolvedValue(mockResponse())
    const onClose = jest.fn()

    createWrapper(
      <ImportWizard placementId="placement-1" onClose={onClose} onCompleted={jest.fn()} />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
