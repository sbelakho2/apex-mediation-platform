import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
// @ts-expect-error jest-axe typings do not expose toHaveNoViolations
import { axe, toHaveNoViolations } from 'jest-axe'
import MigrationExperimentPage from './page'

expect.extend(toHaveNoViolations)

const mockGetExperiment = jest.fn()
const mockGetExperimentReport = jest.fn()
const mockGetExperimentShareLinks = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ experimentId: 'exp-123' }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  migrationApi: {
    getExperiment: (...args: any[]) => mockGetExperiment(...args),
    updateExperiment: jest.fn(),
    activateExperiment: jest.fn(),
    pauseExperiment: jest.fn(),
    evaluateGuardrails: jest.fn(),
    getExperimentReport: (...args: any[]) => mockGetExperimentReport(...args),
    getExperimentShareLinks: (...args: any[]) => mockGetExperimentShareLinks(...args),
    createExperimentShareLink: jest.fn(),
    revokeExperimentShareLink: jest.fn(),
    downloadExperimentReport: jest.fn(),
  },
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type WrapperProps = { children: ReactNode }

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return render(<MigrationExperimentPage />, { wrapper: Wrapper })
}

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

const report = {
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
        unit: 'currency_cents' as const,
        control: 125_000,
        test: 138_000,
        uplift: 10.4,
        sample_size: {
          control: 120000,
          test: 118500,
        },
      },
    ],
    timeseries: [
      {
        id: 'revenue',
        label: 'Net revenue',
        unit: 'currency_cents' as const,
        points: [
          { timestamp: '2025-11-10T00:00:00.000Z', control: 17500, test: 18700 },
          { timestamp: '2025-11-11T00:00:00.000Z', control: 18250, test: 19600 },
          { timestamp: '2025-11-12T00:00:00.000Z', control: 18900, test: 20150 },
        ],
      },
    ],
  },
}

const shareLinks = [
  {
    id: 'link-1',
    url: 'https://example.com/share/migration/exp-123',
    created_at: '2025-11-12T18:00:00.000Z',
    expires_at: '2025-11-19T18:00:00.000Z',
  },
]

beforeAll(() => {
  ;(global as any).ResizeObserver = ResizeObserverMock
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetExperiment.mockResolvedValue(experiment)
  mockGetExperimentReport.mockResolvedValue(report)
  mockGetExperimentShareLinks.mockResolvedValue(shareLinks)
})

describe('MigrationExperimentPage accessibility', () => {
  it('has no axe accessibility violations', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('exposes readable summaries for charts and inputs', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    const captions = container.querySelectorAll('figcaption')
    expect(captions.length).toBeGreaterThan(0)
    expect(Array.from(captions).some((caption) => caption.textContent?.includes('Net revenue chart'))).toBe(true)

    const latencyInput = screen.getByLabelText('Latency budget') as HTMLInputElement
    expect(latencyInput).toHaveAttribute('aria-describedby', 'latency-budget-suffix')
    const latencySuffix = container.querySelector('#latency-budget-suffix')
    expect(latencySuffix?.textContent).toContain('ms')

    const expirationSelect = screen.getByLabelText('Link expiration') as HTMLSelectElement
    expect(expirationSelect).toHaveAttribute('aria-describedby', 'share-link-hint')
  })
})
