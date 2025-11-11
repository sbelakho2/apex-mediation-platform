import React from 'react'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import Navigation from './Navigation'

expect.extend(toHaveNoViolations)

describe('Navigation component — accessibility', () => {
  it('has no detectable a11y violations', async () => {
    const { container } = render(<Navigation><main>Content</main></Navigation>)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
