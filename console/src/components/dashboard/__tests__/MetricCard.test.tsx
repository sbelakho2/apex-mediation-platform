import React from 'react'
import { render, screen } from '@testing-library/react'
import { MetricCard, MetricCardSkeleton } from '../MetricCard'

describe('MetricCard', () => {
  const MockIcon = (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="metric-icon" {...props} />

  it('enforces icon sizing even when a custom element is provided', () => {
    render(
      <MetricCard
        title="Revenue"
        value="$42k"
        change={12.5}
        icon={<MockIcon className="text-primary-500" />}
      />
    )

    const icon = screen.getByTestId('metric-icon')
    expect(icon).toHaveClass('h-5', 'w-5')
    expect(icon).toHaveClass('text-primary-500')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses a custom formatter for change values', () => {
    render(
      <MetricCard
        title="Latency"
        value="123 ms"
        change={25}
        changeFormatter={(value) => `${value.toFixed(0)}ms delta`}
        icon={MockIcon}
      />
    )

    expect(screen.getByText('25ms delta vs last period')).toBeInTheDocument()
  })

  it('renders neutral copy when change is zero', () => {
    render(
      <MetricCard
        title="Fill Rate"
        value="98%"
        change={0}
        icon={MockIcon}
      />
    )

    expect(screen.getByText('No change vs last period')).toBeInTheDocument()
  })
})

describe('MetricCardSkeleton', () => {
  it('renders the requested number of skeleton cards', () => {
    const { container } = render(<MetricCardSkeleton count={2} />)
    expect(container.querySelectorAll('.card')).toHaveLength(2)
  })
})
