import axios, { AxiosInstance, AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import { getCsrfToken, readXsrfCookie } from './csrf'

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'

const appendApiVersion = (value: string, defaultSuffix = '/api/v1') => {
  const normalized = value.replace(/\/+$/, '')
  if (/\/api\/v\d+$/i.test(normalized) || /\/v\d+$/i.test(normalized)) {
    return normalized
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/v1`
  }
  return `${normalized}${defaultSuffix}`
}

const normalizeBase = (candidate: string | undefined, fallbackHost: string) => {
  const base = (candidate && candidate.trim().length > 0 ? candidate.trim() : fallbackHost)
  return appendApiVersion(base)
}

const CORE_HOST = process.env.NEXT_PUBLIC_API_URL
const BASE_URL = USE_MOCK_API ? '/api/mock' : normalizeBase(CORE_HOST, 'http://localhost:8080')
const FRAUD_API_URL = USE_MOCK_API
  ? '/api/mock'
  : normalizeBase(process.env.NEXT_PUBLIC_FRAUD_API_URL, CORE_HOST || 'http://localhost:8080')
const ANALYTICS_API_URL = USE_MOCK_API
  ? '/api/mock'
  : normalizeBase(process.env.NEXT_PUBLIC_ANALYTICS_API_URL, CORE_HOST || 'http://localhost:8080')

// Create axios instances
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export const fraudApiClient: AxiosInstance = axios.create({
  baseURL: FRAUD_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export const analyticsApiClient: AxiosInstance = axios.create({
  baseURL: ANALYTICS_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

let inflightCsrfRequest: Promise<string | null> | null = null

async function ensureBrowserCsrfToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const existing = readXsrfCookie()
  if (existing) return existing

  if (!inflightCsrfRequest) {
    inflightCsrfRequest = getCsrfToken().catch(() => null).finally(() => {
      inflightCsrfRequest = null
    })
  }

  return inflightCsrfRequest
}

const requestInterceptor = async (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toLowerCase()
  if (MUTATING_METHODS.has(method)) {
    const token = await ensureBrowserCsrfToken()
    if (token) {
      const headers = AxiosHeaders.from(config.headers || {})
      headers.set('X-CSRF-Token', token)
      config.headers = headers
    }
  }
  return config
}

export const AUTH_UNAUTHORIZED_EVENT = 'apex:auth:unauthorized'

type UnauthorizedHandler = (error: AxiosError) => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

function emitUnauthorized(error: AxiosError) {
  if (unauthorizedHandler) {
    unauthorizedHandler(error)
    return
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_UNAUTHORIZED_EVENT, {
        detail: {
          status: error.response?.status || null,
          url: error.config?.url,
        },
      })
    )
  }
}

// Response interceptor - handle errors
const responseErrorInterceptor = async (error: AxiosError) => {
  if (error.response?.status === 401) {
    emitUnauthorized(error)
  }
  return Promise.reject(error)
}

// Apply interceptors
apiClient.interceptors.request.use(requestInterceptor)
apiClient.interceptors.response.use((response) => response, responseErrorInterceptor)

fraudApiClient.interceptors.request.use(requestInterceptor)
fraudApiClient.interceptors.response.use((response) => response, responseErrorInterceptor)

analyticsApiClient.interceptors.request.use(requestInterceptor)
analyticsApiClient.interceptors.response.use((response) => response, responseErrorInterceptor)

// API helper functions
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message
  }
  const maybeResponse = (error as any)?.response?.data?.message
  if (maybeResponse) return maybeResponse
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

// Cookie-based auth; no localStorage usage
