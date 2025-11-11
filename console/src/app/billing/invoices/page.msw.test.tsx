import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InvoicesPage from './page'
import { server } from '@/tests/msw/server'
import { errorHandlers } from '@/tests/msw/handlers'

// Mock next/navigation minimal router
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/billing/invoices',
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('InvoicesPage — MSW error states', () => {
  it('shows 401 Unauthorized error state', async () => {
    server.use(errorHandlers.unauthorized)
    render(<InvoicesPage />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/unauthorized/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('shows 403 Forbidden error state', async () => {
    server.use(errorHandlers.forbidden)
    render(<InvoicesPage />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/forbidden/i)).toBeInTheDocument()
    })
  })

  it('shows 404 Not Found empty/error state', async () => {
    server.use(errorHandlers.notFound)
    render(<InvoicesPage />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })
})
