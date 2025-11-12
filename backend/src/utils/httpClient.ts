import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getRequestContext } from '../middleware/requestContext';

/**
 * Create an Axios instance with request ID propagation
 * Automatically adds x-request-id header to outbound HTTP calls
 * 
 * @param baseURL - Base URL for the API
 * @param additionalConfig - Additional axios configuration
 * @returns Configured axios instance
 */
export function createHttpClient(baseURL?: string, additionalConfig?: any): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 10000,
    ...additionalConfig,
  });

  // Request interceptor: Add request ID to outbound calls
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const context = getRequestContext();
      
      if (context?.requestId) {
        config.headers = config.headers || {};
        config.headers['x-request-id'] = context.requestId;
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Default HTTP client for internal services
 */
export const httpClient = createHttpClient();
