import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import Page from './page'

jest.mock('@/lib/api', () => {
  return {
    toolsApi: {
      inspectAppAds: jest.fn(async (_domain: string) => ({
        domain: _domain,
        fetched: true,
        httpStatus: 200,
        vendors: [
          { vendor: 'admob', pass: true, missing: [], suggested: [] },
          { vendor: 'unity', pass: false, missing: ['unity.com, XXXXXXXXXXXXXXXX, DIRECT'], suggested: ['unity.com, XXXXXXXXXXXXXXXX, DIRECT'] },
        ],
        rawSample: 'google.com, pub-xxx, DIRECT, f08c47fec0942fa0' ,
      })),
    },
  }
})

describe('App-ads.txt Inspector Page', () => {
  it('renders form, runs inspector, and displays results', async () => {
    render(<Page />)

    const input = screen.getByLabelText(/Domain/i)
    fireEvent.change(input, { target: { value: 'example.com' } })

    const runBtn = screen.getByRole('button', { name: /Run/i })
    fireEvent.click(runBtn)

    // Wait for results to render
    await waitFor(() => {
      expect(screen.getByText('admob')).toBeInTheDocument()
      expect(screen.getByText('unity')).toBeInTheDocument()
    })

    // Toggle raw sample
    const toggle = screen.getByRole('button', { name: /Show raw sample/i })
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(screen.getByText(/google.com, pub-xxx/i)).toBeInTheDocument()
    })
  })
})
