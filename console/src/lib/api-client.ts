import axios, { AxiosInstance, AxiosError } from 'axios'
import { getCsrfToken, readXsrfCookie } from './csrf'

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'
const BASE_URL = USE_MOCK_API ? '/api/mock' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1')
const FRAUD_API_URL = USE_MOCK_API ? '/api/mock' : (process.env.NEXT_PUBLIC_FRAUD_API_URL || 'http://localhost:4000/api/v1')
const ANALYTICS_API_URL = USE_MOCK_API ? '/api/mock' : (process.env.NEXT_PUBLIC_ANALYTICS_API_URL || 'http://localhost:4000/api/v1')

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

// Request interceptor - include CSRF token for mutating requests
const requestInterceptor = async (config: any) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    // Ensure we have a token cookie; request one if absent
    const existing = typeof window !== 'undefined' ? readXsrfCookie() : null
    if (!existing && typeof window !== 'undefined') {
      try { await getCsrfToken() } catch {}
    }
    const token = typeof window !== 'undefined' ? readXsrfCookie() : null
    if (token) {
      config.headers['X-CSRF-Token'] = token
    }
  }
  return config
}

// Response interceptor - handle errors
const responseErrorInterceptor = async (error: AxiosError) => {
  if (error.response?.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
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
