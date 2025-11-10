import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CopyButton } from '../CopyButton'

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
})

describe('CopyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders default variant', () => {
    render(<CopyButton text="test-content" />)
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument()
  })

  it('copies text to clipboard on click', async () => {
    render(<CopyButton text="test-content" />)
    
    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-content')
    })
  })

  it('shows copied state after successful copy', async () => {
    render(<CopyButton text="test-content" />)
    
    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
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
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('handles different sizes', () => {
    const { rerender } = render(<CopyButton text="test" size="sm" />)
    expect(screen.getByRole('button').className).toContain('text-xs')
    
    rerender(<CopyButton text="test" size="md" />)
    expect(screen.getByRole('button').className).toContain('text-sm')
  })

  it('resets copied state after timeout', async () => {
    jest.useFakeTimers()
    
    render(<CopyButton text="test" />)
    const button = screen.getByRole('button')
    
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
    
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    
    await waitFor(() => {
      expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    })
    
    jest.useRealTimers()
  })
})
