import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import Page from './page'

jest.mock('@/lib/api', () => {
  return {
    analyticsByo: {
      getAdapterMetrics: jest.fn(async () => ({
        summary: { p50: 12, p95: 34, p99: 56, fills: 1, noFills: 2, timeouts: 3, errors: 4, total: 10 },
      })),
      getTraces: jest.fn(async () => ({
        traces: [
          { trace_id: 't1', placement: 'home', spans: [ { adapter: 'admob', latency_ms: 120, outcome: 'fill' } ] },
          { trace_id: 't2', placement: 'home', spans: [ { adapter: 'unity', latency_ms: 240, outcome: 'no_fill' } ] },
        ],
      })),
    },
  }
})

describe('Mediation Debugger Page', () => {
  it('renders filters, runs queries, and displays summary and traces', async () => {
    render(<Page />)

    // Enter appId to enable run
    const appIdInput = screen.getByPlaceholderText('your-app-id')
    fireEvent.change(appIdInput, { target: { value: 'app-1' } })

    const runBtn = screen.getByRole('button', { name: /Run/i })
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(screen.getByText(/p50/i)).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
    })

    // Traces table should render entries
    await waitFor(() => {
      expect(screen.getByText('t1')).toBeInTheDocument()
      expect(screen.getByText('admob')).toBeInTheDocument()
      expect(screen.getByText('120ms')).toBeInTheDocument()
    })
  })
})
