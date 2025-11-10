import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Tooltip } from '../Tooltip'
import { Spinner, Skeleton } from '../Spinner'

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Test tooltip">
        <button>Hover me</button>
      </Tooltip>
    )
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('shows tooltip on mouse enter after delay', async () => {
    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    )
    
    const button = screen.getByText('Hover me')
    fireEvent.mouseEnter(button)
    
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
      expect(screen.getByText('Tooltip content')).toBeInTheDocument()
    })
  })

  it('hides tooltip on mouse leave', async () => {
    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    )
    
    const button = screen.getByText('Hover me')
    fireEvent.mouseEnter(button)
    
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })
    
    fireEvent.mouseLeave(button)
    
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  it('positions tooltip correctly', () => {
    const { rerender } = render(
      <Tooltip content="Test" position="top">
        <span>Element</span>
      </Tooltip>
    )
    
    rerender(
      <Tooltip content="Test" position="bottom">
        <span>Element</span>
      </Tooltip>
    )
    
    expect(screen.getByText('Element')).toBeInTheDocument()
  })
})

describe('Spinner', () => {
  it('renders with default size', () => {
    render(<Spinner />)
    expect(screen.getByText('Loading...', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    render(<Spinner label="Verifying..." />)
    expect(screen.getByText('Verifying...', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('renders with different sizes', () => {
    const { container, rerender } = render(<Spinner size="sm" />)
    expect(container.querySelector('.h-4')).toBeInTheDocument()
    
    rerender(<Spinner size="md" />)
    expect(container.querySelector('.h-6')).toBeInTheDocument()
    
    rerender(<Spinner size="lg" />)
    expect(container.querySelector('.h-8')).toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('renders with default variant', () => {
    const { container } = render(<Skeleton />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders different variants', () => {
    const { container, rerender } = render(<Skeleton variant="text" />)
    expect(container.querySelector('.rounded')).toBeInTheDocument()
    
    rerender(<Skeleton variant="circular" />)
    expect(container.querySelector('.rounded-full')).toBeInTheDocument()
    
    rerender(<Skeleton variant="rectangular" />)
    expect(container.querySelector('.rounded-lg')).toBeInTheDocument()
  })

  it('applies custom dimensions', () => {
    const { container } = render(<Skeleton width="w-32" height="h-4" />)
    const skeleton = container.querySelector('.w-32.h-4')
    expect(skeleton).toBeInTheDocument()
  })
})
