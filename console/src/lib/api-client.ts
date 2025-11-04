import axios, { AxiosInstance, AxiosError } from 'axios'

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
})

export const fraudApiClient: AxiosInstance = axios.create({
  baseURL: FRAUD_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const analyticsApiClient: AxiosInstance = axios.create({
  baseURL: ANALYTICS_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
const requestInterceptor = (config: any) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

// Response interceptor - handle errors
const responseErrorInterceptor = async (error: AxiosError) => {
  if (error.response?.status === 401) {
    // Clear token and redirect to login
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
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
  return 'An unexpected error occurred'
}

export const setAuthToken = (token: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token)
  }
}

export const clearAuthToken = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token')
  }
}

export const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token')
  }
  return null
}
