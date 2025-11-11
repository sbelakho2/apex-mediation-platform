// JSDOM + Next.js environment tweaks for tests
process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED = process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED || 'true'

import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// Basic mock for next-auth session to avoid errors when components import it
jest.mock('next-auth/react', () => ({
  __esModule: true,
  ...jest.requireActual('next-auth/react'),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: jest.fn(),
}))
