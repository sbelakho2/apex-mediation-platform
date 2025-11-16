import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import MigrationExperimentPage from './page'

const mockGetExperiment = jest.fn()
const mockUpdateExperiment = jest.fn()
const mockActivateExperiment = jest.fn()
const mockPauseExperiment = jest.fn()
const mockEvaluateGuardrails = jest.fn()
const mockGetExperimentReport = jest.fn()
const mockGetExperimentShareLinks = jest.fn()
const mockCreateExperimentShareLink = jest.fn()
const mockRevokeExperimentShareLink = jest.fn()
const mockDownloadExperimentReport = jest.fn()
const mockPush = jest.fn()
const clipboardWriteTextMock = jest.fn()
const createObjectURLMock = jest.fn(() => 'blob:mock')
const revokeObjectURLMock = jest.fn()
const originalAnchorClick = HTMLAnchorElement.prototype.click

jest.mock('next/navigation', () => ({
  useParams: () => ({ experimentId: 'exp-123' }),
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/lib/api', () => ({
  migrationApi: {
    getExperiment: (...args: any[]) => mockGetExperiment(...args),
    updateExperiment: (...args: any[]) => mockUpdateExperiment(...args),
    activateExperiment: (...args: any[]) => mockActivateExperiment(...args),
    pauseExperiment: (...args: any[]) => mockPauseExperiment(...args),
    evaluateGuardrails: (...args: any[]) => mockEvaluateGuardrails(...args),
    getExperimentReport: (...args: any[]) => mockGetExperimentReport(...args),
    getExperimentShareLinks: (...args: any[]) => mockGetExperimentShareLinks(...args),
    createExperimentShareLink: (...args: any[]) => mockCreateExperimentShareLink(...args),
    revokeExperimentShareLink: (...args: any[]) => mockRevokeExperimentShareLink(...args),
    downloadExperimentReport: (...args: any[]) => mockDownloadExperimentReport(...args),
  },
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  ;(global as any).ResizeObserver = ResizeObserverMock
  Object.defineProperty(window.URL, 'createObjectURL', {
    value: createObjectURLMock,
    configurable: true,
  })
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    value: revokeObjectURLMock,
    configurable: true,
  })
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: jest.fn(),
  })
})

afterAll(() => {
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: originalAnchorClick,
  })
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return Wrapper
}

describe('MigrationExperimentPage', () => {
  const experiment = {
    id: 'exp-123',
    publisher_id: 'pub-1',
    name: 'Shadow ironSource waterfall',
    description: 'Mirror 5% to validate revenue parity before cutover.',
    app_id: 'app-1',
    placement_id: 'placement-1',
    objective: 'revenue_comparison' as const,
    seed: 'seed-1',
    mirror_percent: 5,
    mode: 'mirroring' as const,
    status: 'active' as const,
    activated_at: '2025-11-10T00:00:00.000Z',
    paused_at: undefined,
    completed_at: undefined,
    guardrails: {
      latency_budget_ms: 250,
      revenue_floor_percent: 98,
      max_error_rate_percent: 2,
      min_impressions: 10000,
    },
    last_guardrail_check: '2025-11-12T12:00:00.000Z',
    created_by: 'user@test.dev',
    created_at: '2025-11-09T20:00:00.000Z',
    updated_at: '2025-11-12T21:00:00.000Z',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    clipboardWriteTextMock.mockReset()
    clipboardWriteTextMock.mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: clipboardWriteTextMock },
      configurable: true,
    })
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()
    mockGetExperiment.mockResolvedValue(experiment)
    mockGetExperimentReport.mockResolvedValue({
      experiment_id: experiment.id,
      generated_at: '2025-11-12T21:30:00.000Z',
      window: {
        start: '2025-11-05T00:00:00.000Z',
        end: '2025-11-12T00:00:00.000Z',
        timezone: 'UTC',
      },
      metrics: {
        overall: [
          {
            id: 'revenue',
            label: 'Net revenue',
            unit: 'currency_cents',
            control: 125_000,
            test: 138_000,
            uplift: 10.4,
            sample_size: {
              control: 120000,
              test: 118500,
            },
          },
          {
            id: 'latency_p95',
            label: 'Latency p95',
            unit: 'milliseconds',
            control: 430,
            test: 405,
            uplift: 5.8,
          },
        ],
        timeseries: [
          {
            id: 'revenue',
            label: 'Net revenue',
            unit: 'currency_cents',
            points: [
              { timestamp: '2025-11-10T00:00:00.000Z', control: 17500, test: 18700 },
              { timestamp: '2025-11-11T00:00:00.000Z', control: 18250, test: 19600 },
              { timestamp: '2025-11-12T00:00:00.000Z', control: 18900, test: 20150 },
            ],
          },
          {
            id: 'latency_p95',
            label: 'Latency p95',
            unit: 'milliseconds',
            points: [
              { timestamp: '2025-11-10T00:00:00.000Z', control: 440, test: 420 },
              { timestamp: '2025-11-11T00:00:00.000Z', control: 435, test: 410 },
              { timestamp: '2025-11-12T00:00:00.000Z', control: 430, test: 405 },
            ],
          },
        ],
      },
    })
    mockGetExperimentShareLinks.mockResolvedValue([
      {
        id: 'share-1',
        url: 'https://reports.example.com/r/share-1',
        created_at: '2025-11-12T21:30:00.000Z',
        expires_at: '2025-11-19T21:30:00.000Z',
      },
    ])
    mockCreateExperimentShareLink.mockResolvedValue({
      id: 'share-2',
      url: 'https://reports.example.com/r/share-2',
      created_at: '2025-11-12T22:00:00.000Z',
      expires_at: '2025-11-19T22:00:00.000Z',
    })
    mockRevokeExperimentShareLink.mockResolvedValue(undefined)
    mockDownloadExperimentReport.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
  })

  it('renders experiment detail and guardrail fields', async () => {
    render(<MigrationExperimentPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: experiment.name })).toBeInTheDocument()

    const mirrorPercentControls = screen.getAllByLabelText(/mirror percent/i)
    const mirrorNumberInput = mirrorPercentControls.find(
      (element) => (element as HTMLInputElement).type === 'number'
    ) as HTMLInputElement | undefined
    expect(mirrorNumberInput).toBeDefined()
    expect(mirrorNumberInput!).toHaveAttribute('value', `${experiment.mirror_percent}`)

    expect(screen.getByLabelText(/latency budget/i)).toHaveAttribute(
      'value',
      `${experiment.guardrails?.latency_budget_ms}`
    )
    expect(screen.getByText(/Save guardrails/i)).toBeInTheDocument()
  })

  it('renders comparison metrics once the report loads', async () => {
    render(<MigrationExperimentPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('$1,250.00')).toBeInTheDocument()
    const metricHeadings = screen.getAllByRole('heading', { level: 3, name: 'Net revenue' })
    expect(metricHeadings.length).toBeGreaterThan(0)
    expect(screen.getByText('Sample size — Control: 120,000, Test: 118,500')).toBeInTheDocument()
    expect(mockGetExperimentReport).toHaveBeenCalledWith(
      experiment.id,
      expect.objectContaining({ window: 'last_7_days', granularity: 'day' })
    )
  })

  it('renders timeseries chart controls for report metrics', async () => {
    render(<MigrationExperimentPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('button', { name: 'Net revenue' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('metric-timeseries-chart')).toBeInTheDocument()
    expect(await screen.findAllByTestId('metric-timeseries-mini-chart')).toHaveLength(2)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Latency p95' }))
    expect(screen.getByRole('button', { name: 'Latency p95' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('displays guardrail evaluation result when mutation succeeds', async () => {
    mockEvaluateGuardrails.mockResolvedValue({
      shouldPause: true,
      violations: ['Latency above budget'],
    })

    render(<MigrationExperimentPage />, { wrapper: createWrapper() })

    await screen.findByRole('heading', { name: experiment.name })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /evaluate guardrails/i }))

    await waitFor(() => expect(mockEvaluateGuardrails).toHaveBeenCalledWith(experiment.id))
    expect(await screen.findByText(/guardrails triggered/i)).toBeInTheDocument()
    expect(screen.getByText('Latency above budget')).toBeInTheDocument()
  })

  it('manages shareable links and downloads the signed report', async () => {
    render(<MigrationExperimentPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(/Shareable links/i)).toBeInTheDocument()

    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Generate link/i }))
    await waitFor(() =>
      expect(mockCreateExperimentShareLink).toHaveBeenCalledWith(experiment.id, {
        expires_in_hours: 168,
      })
    )

    await user.click(await screen.findByRole('button', { name: /Copy link/i }))
    expect(await screen.findByRole('button', { name: /Copied/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Revoke link/i }))
    await waitFor(() =>
      expect(mockRevokeExperimentShareLink).toHaveBeenCalledWith(experiment.id, 'share-1')
    )

    await user.click(screen.getByRole('button', { name: /Download JSON/i }))
    await waitFor(() => expect(mockDownloadExperimentReport).toHaveBeenCalledWith(experiment.id))
  })
})
