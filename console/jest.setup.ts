// JSDOM + Next.js environment tweaks for tests
process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED = process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED || 'true'

import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// MSW setup for tests (browser-like)
import { server } from './src/tests/msw/server'

// Establish API mocking before all tests.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// Reset any request handlers that are declared as a part of our tests
// (i.e. for testing one-time error scenarios).
afterEach(() => server.resetHandlers())

// Clean up after the tests are finished.
afterAll(() => server.close())

// Basic mock for next-auth session to avoid errors when components import it
jest.mock('next-auth/react', () => ({
  __esModule: true,
  ...jest.requireActual('next-auth/react'),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: jest.fn(),
}))
