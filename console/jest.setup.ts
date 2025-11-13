// JSDOM + Next.js environment tweaks for tests
process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED = process.env.NEXT_PUBLIC_TRANSPARENCY_ENABLED || 'true'

import { TextEncoder, TextDecoder } from 'util'
import axios from 'axios'
import 'whatwg-fetch'
import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// Configure axios to use a fetch-based adapter compatible with MSW in JSDOM
const AxiosErrorCtor = (axios as any).AxiosError

axios.defaults.adapter = async (config) => {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost'
  const baseURL = config.baseURL || ''
  const inputUrl = config.url || ''

  let url: URL
  if (/^https?:\/\//i.test(inputUrl)) {
    url = new URL(inputUrl)
  } else if (baseURL) {
    url = new URL(inputUrl, baseURL)
  } else {
    url = new URL(inputUrl, origin)
  }

  if (config.params) {
    const params = config.params as Record<string, unknown>
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, String(v)))
      } else {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const requestUrl = url.toString()

  const headers = new Headers()
  if (config.headers) {
    if (typeof (config.headers as any).forEach === 'function') {
      ;(config.headers as any).forEach((value: unknown, key: string) => {
        if (value !== undefined) headers.set(key, String(value))
      })
    } else {
      Object.entries(config.headers as Record<string, unknown>).forEach(([key, value]) => {
        if (value !== undefined) headers.set(key, String(value))
      })
    }
  }

  const method = (config.method || 'get').toUpperCase()
  let body: any = config.data
  const requiresBody = !['GET', 'HEAD'].includes(method)

  if (!requiresBody) {
    body = undefined
  } else if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof URLSearchParams)) {
    body = JSON.stringify(body)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  const response = await fetch(requestUrl, {
    method,
    headers,
    body,
    credentials: config.withCredentials ? 'include' : 'same-origin',
  })

  const responseHeaders: Record<string, string> = {}
  response.headers?.forEach((value, key) => {
    responseHeaders[key] = value
  })

  const derivedValidateStatus =
    typeof config.validateStatus === 'function'
      ? config.validateStatus
      : (status?: number) => {
          if (typeof status !== 'number') return false
          return status >= 200 && status < 300
        }

  let data: any = null
  if (config.responseType === 'arraybuffer') {
    data = await response.arrayBuffer()
  } else if (config.responseType === 'blob') {
    data = await response.blob()
  } else if (config.responseType === 'text') {
    data = await response.text()
  } else {
    const text = await response.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    } else {
      data = null
    }
  }

  const axiosResponse = {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    config,
    request: {},
  }

  const shouldResolve = derivedValidateStatus(response.status)

  if (!shouldResolve) {
    if (AxiosErrorCtor) {
      throw new AxiosErrorCtor(
        `Request failed with status code ${response.status}`,
        undefined,
        config,
        undefined,
        axiosResponse
      )
    }

    const error: any = new Error(`Request failed with status code ${response.status}`)
    error.config = config
    error.response = axiosResponse
    error.isAxiosError = true
    throw error
  }

  return axiosResponse
}

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
