import { render, screen } from '@testing-library/react'
import { AppShell } from '../AppShell'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: jest.fn(),
}))

jest.mock('@/components/Navigation', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="nav">{children}</div>,
}))

const mockedUsePathname = usePathname as jest.MockedFunction<typeof usePathname>

describe('AppShell', () => {
  it('renders children without navigation for public routes', () => {
    mockedUsePathname.mockReturnValue('/login')

    render(
      <AppShell>
        <p>login page</p>
      </AppShell>
    )

    expect(screen.getByText('login page')).toBeVisible()
    expect(screen.queryByTestId('nav')).toBeNull()
  })

  it('wraps children in navigation for private routes', () => {
    mockedUsePathname.mockReturnValue('/dashboard')

    render(
      <AppShell>
        <p>dashboard</p>
      </AppShell>
    )

    expect(screen.getByTestId('nav')).toBeInTheDocument()
    expect(screen.getByText('dashboard')).toBeVisible()
  })
})
