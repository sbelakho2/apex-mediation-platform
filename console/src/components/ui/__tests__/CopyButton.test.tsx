import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton, __setCopyButtonTestClipboard } from '../CopyButton'

const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
const originalQueryCommandSupported = Object.getOwnPropertyDescriptor(document, 'queryCommandSupported')
const originalNodeEnv = process.env.NODE_ENV

const setSecureContext = (value: boolean) => {
  Object.defineProperty(window, 'isSecureContext', {
    value,
    configurable: true,
    writable: true,
  })
}

const mockQueryCommandSupported = (value: boolean) => {
  Object.defineProperty(document, 'queryCommandSupported', {
    value: jest.fn(() => value),
    configurable: true,
  })
}

beforeAll(() => {
  setSecureContext(true)
  mockQueryCommandSupported(true)
})

afterAll(() => {
  if (originalSecureContext) {
    Object.defineProperty(window, 'isSecureContext', originalSecureContext)
  }
  if (originalQueryCommandSupported) {
    Object.defineProperty(document, 'queryCommandSupported', originalQueryCommandSupported)
  }
})

describe('CopyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setSecureContext(true)
    mockQueryCommandSupported(true)
    __setCopyButtonTestClipboard(async () => Promise.resolve())
  })

  afterEach(() => {
    __setCopyButtonTestClipboard(null)
    jest.useRealTimers()
  })

  it('renders default variant', () => {
    render(<CopyButton text="test-content" />)
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument()
  })

  it('copies text to clipboard on click', async () => {
    const writer = jest.fn(() => Promise.resolve())
    __setCopyButtonTestClipboard(writer)

    render(<CopyButton text="test-content" />)

    await userEvent.click(screen.getByRole('button'))

    expect(writer).toHaveBeenCalledWith('test-content')
  })

  it('shows copied state after successful copy', async () => {
    render(<CopyButton text="test-content" />)

    await userEvent.click(screen.getByRole('button'))

    const matches = await screen.findAllByText('Copied')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders with custom label', () => {
    render(<CopyButton text="test" label="Copy Auction ID" />)
    expect(screen.getByRole('button', { name: /copy auction id/i })).toBeInTheDocument()
  })

  it('renders icon variant', () => {
    render(<CopyButton text="test" variant="icon" />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('p-1')
  })

  it('renders inline variant', () => {
    render(<CopyButton text="test" variant="inline" label="Copy" />)
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('handles different sizes', () => {
    const { rerender } = render(<CopyButton text="test" size="sm" />)
    expect(screen.getByRole('button').className).toContain('text-xs')

    rerender(<CopyButton text="test" size="md" />)
    expect(screen.getByRole('button').className).toContain('text-sm')
  })

  it('resets copied state after timeout', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    render(<CopyButton text="test" />)
    await user.click(screen.getByRole('button'))

    const matches = await screen.findAllByText('Copied')
    expect(matches.length).toBeGreaterThan(0)

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    expect(screen.queryAllByText('Copied')).toHaveLength(0)
  })

  it('shows fallback hint when clipboard unsupported in insecure context', async () => {
    setSecureContext(false)
    mockQueryCommandSupported(false)
    __setCopyButtonTestClipboard(null)
    expect(window.isSecureContext).toBe(false)

    render(<CopyButton text="test" />)

  const button = await screen.findByRole('button', { name: /copy to clipboard/i })
  const fallback = await screen.findByTestId('copy-fallback-hint')
  await waitFor(() => expect(button).toBeDisabled())
    expect(fallback.textContent).toMatch(/select the text manually/i)

    setSecureContext(true)
    mockQueryCommandSupported(true)
  })

  it('shows error message when clipboard write fails', async () => {
    const writer = jest.fn(() => Promise.reject(new Error('copy failed')))
    __setCopyButtonTestClipboard(writer)

    render(<CopyButton text="test" />)

    await userEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }))

    const errorMessages = await screen.findAllByText(/copy failed/i)
    expect(errorMessages.length).toBeGreaterThan(0)
  })

  it('renders tooltip content for the current status', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    render(<CopyButton text="test" label="Copy Auction" />)

    const button = screen.getByRole('button', { name: /copy auction/i })
    await user.hover(button)
    act(() => jest.advanceTimersByTime(250))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy Auction')
  })

  it('shows tooltip error details when copy fails', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const writer = jest.fn(() => Promise.reject(new Error('copy failed')))
    __setCopyButtonTestClipboard(writer)

    render(<CopyButton text="test" />)

    const button = screen.getByRole('button', { name: /copy to clipboard/i })
  await user.click(button)

    await user.hover(button)
    act(() => jest.advanceTimersByTime(250))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(/unable to copy/i)
    expect(tooltip).toHaveTextContent(/copy failed/i)
  })
})
