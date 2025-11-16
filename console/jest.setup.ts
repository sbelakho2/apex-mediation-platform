// JSDOM + Next.js environment tweaks for tests
process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED = process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED || 'true'

import { TextEncoder, TextDecoder } from 'util'
import axios, { type AxiosAdapter } from 'axios'
import 'whatwg-fetch'
import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

const xhrAdapter: AxiosAdapter = require('axios/lib/adapters/xhr.js')

jest.mock('recharts', () => {
  const React = require('react')
  const Recharts = jest.requireActual('recharts')

  const DEFAULT_WIDTH = 800
  const DEFAULT_HEIGHT = 400

  function ResponsiveContainerMock({ width, height, aspect, children }: any) {
    const numericWidth = typeof width === 'number' ? width : DEFAULT_WIDTH
    let numericHeight = typeof height === 'number' ? height : DEFAULT_HEIGHT

    if (typeof height !== 'number' && typeof aspect === 'number' && aspect > 0) {
      numericHeight = Math.round(numericWidth / aspect)
    }

    return React.createElement(
      'div',
      { style: { width: numericWidth, height: numericHeight } },
      typeof children === 'function' ? children({ width: numericWidth, height: numericHeight }) : children
    )
  }

  return {
    ...Recharts,
    ResponsiveContainer: ResponsiveContainerMock,
  }
})

axios.defaults.adapter = xhrAdapter

// Default feature flag response handled through MSW (no fetch override)

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder
}

if (typeof (globalThis as any).HTMLCanvasElement !== 'undefined') {
  const canvasProto = (globalThis as any).HTMLCanvasElement.prototype
  canvasProto.getContext = function getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData: () => {},
      createImageData: () => new Uint8ClampedArray(),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      canvas: this,
    }
  }
}

if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  ;(globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
}

if (typeof (globalThis as any).BroadcastChannel === 'undefined') {
  class MockBroadcastChannel {
    name: string
    onmessage: ((this: BroadcastChannel, ev: MessageEvent) => unknown) | null = null
    constructor(name: string) {
      this.name = name
    }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false
    }
  }
  ;(globalThis as any).BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel
}

if (typeof (globalThis as any).WritableStream === 'undefined') {
  class MockWritableStream {
    getWriter() {
      return {
        write: () => {},
        close: () => {},
        releaseLock: () => {},
      }
    }
  }
  ;(globalThis as any).WritableStream = MockWritableStream as unknown as typeof WritableStream
}

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
