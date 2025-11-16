import React from 'react'
import { act, render } from '@testing-library/react'
import { CopyButton } from '../CopyButton'

const originalClipboard = navigator.clipboard
const originalQueryCommandSupported = document.queryCommandSupported
const originalSecureContext = window.isSecureContext

const setClipboardMock = (mock?: Partial<Clipboard>) => {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: mock,
    configurable: true,
  })
}

const setSecureContext = (value: boolean) => {
  Object.defineProperty(window, 'isSecureContext', {
    value,
    configurable: true,
  })
}

beforeAll(() => {
  setSecureContext(true)
  Object.defineProperty(document, 'queryCommandSupported', {
    value: jest.fn(() => true),
    configurable: true,
  })
})

afterAll(() => {
  setClipboardMock(originalClipboard)
  Object.defineProperty(document, 'queryCommandSupported', {
    value: originalQueryCommandSupported,
    configurable: true,
  })
  if (typeof originalSecureContext !== 'undefined') {
    setSecureContext(originalSecureContext)
  }
})

describe('CopyButton', () => {
  let clipboardMock: { writeText: jest.Mock }

  beforeEach(() => {
    clipboardMock = {
      writeText: jest.fn(() => Promise.resolve()),
    }
    setClipboardMock(clipboardMock)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders default variant', () => {
    const { getByRole } = render(<CopyButton text="test-content" />)
    expect(getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument()
  })

  it('copies text to clipboard on click', async () => {
    const { getByRole } = render(<CopyButton text="test-content" />)

    const button = getByRole('button')
    await act(async () => {
      button.click()
    })

    expect(clipboardMock.writeText).toHaveBeenCalledWith('test-content')
  })

  it('shows copied state after successful copy', async () => {
    const { getByRole, findAllByText } = render(<CopyButton text="test-content" />)

    await act(async () => {
      getByRole('button').click()
    })

    const matches = await findAllByText('Copied')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders with custom label', () => {
    const { getByRole } = render(<CopyButton text="test" label="Copy Auction ID" />)
    expect(getByRole('button', { name: /copy auction id/i })).toBeInTheDocument()
  })

  it('renders icon variant', () => {
    const { getByRole } = render(<CopyButton text="test" variant="icon" />)
    const button = getByRole('button')
    expect(button.className).toContain('p-1')
  })

  it('renders inline variant', () => {
    const { getByText } = render(<CopyButton text="test" variant="inline" label="Copy" />)
    expect(getByText('Copy')).toBeInTheDocument()
  })

  it('handles different sizes', () => {
    const { rerender, getByRole } = render(<CopyButton text="test" size="sm" />)
    expect(getByRole('button').className).toContain('text-xs')

    rerender(<CopyButton text="test" size="md" />)
    expect(getByRole('button').className).toContain('text-sm')
  })

  it('resets copied state after timeout', async () => {
    jest.useFakeTimers()

    const { getByRole, queryAllByText, findAllByText } = render(<CopyButton text="test" />)
    const button = getByRole('button')

    await act(async () => {
      button.click()
    })

    const matches = await findAllByText('Copied')
    expect(matches.length).toBeGreaterThan(0)

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    expect(queryAllByText('Copied')).toHaveLength(0)

    jest.useRealTimers()
  })

  it('shows fallback hint when clipboard unsupported in insecure context', async () => {
    setSecureContext(false)
    setClipboardMock(undefined)
    Object.defineProperty(document, 'queryCommandSupported', {
      value: jest.fn(() => false),
      configurable: true,
    })

    const { findByRole, findByTestId } = render(<CopyButton text="test" />)

    const button = await findByRole('button', { name: /copy to clipboard/i })
    expect(button).toBeDisabled()
    const fallback = await findByTestId('copy-fallback-hint')
    expect(fallback.textContent).toMatch(/select the text manually/i)

    setSecureContext(true)
    Object.defineProperty(document, 'queryCommandSupported', {
      value: jest.fn(() => true),
      configurable: true,
    })
  })

  it('shows error message when clipboard write fails', async () => {
    clipboardMock.writeText.mockRejectedValueOnce(new Error('copy failed'))

    const { getByRole, findByText } = render(<CopyButton text="test" />)

    await act(async () => {
      getByRole('button', { name: /copy to clipboard/i }).click()
    })

    expect(await findByText(/copy failed/i)).toBeInTheDocument()
  })
})
