/**
 * Backend API client configuration — with credentials, retries, and de‑duping.
 */

const appendApiVersion = (value: string, defaultSuffix = '/api/v1') => {
  const normalized = value.replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(normalized) || /\/v\d+$/i.test(normalized)) {
    return normalized;
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/v1`;
  }
  return `${normalized}${defaultSuffix}`;
};

const BACKEND_URL = appendApiVersion(
  process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8080'
);

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number;
}

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

const inflight = new Map<string, Promise<ApiResponse<any>>>();

function keyOf(url: string, method: Method, body?: unknown) {
  // Keep body out for GET; for mutations, include a short hash to dedupe identical concurrent calls
  const b = method === 'GET' ? '' : JSON.stringify(body ?? '');
  return `${method} ${url} ${b}`;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, backoffMs = 200): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res; // do not retry 4xx
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    // Exponential backoff with jitter
    const delay = backoffMs * Math.pow(2, i) + Math.floor(Math.random() * 50);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw lastErr;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Make an authenticated API request (credentials included for cookie-based auth).
   */
  async request<T = any>(
    endpoint: string,
    options: RequestInit & { method?: Method; dedupeKey?: string; attempts?: number } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method || 'GET') as Method;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const dedupeKey = options.dedupeKey || keyOf(url, method, (options as any).body);
    if (inflight.has(dedupeKey)) return inflight.get(dedupeKey)! as Promise<ApiResponse<T>>;

    const exec = (async () => {
      try {
        const res = await fetchWithRetry(
          url,
          {
            ...options,
            headers,
            credentials: 'include',
            mode: 'cors',
            cache: 'no-store',
          },
          options.attempts ?? 3
        );

        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const body = isJson ? await res.json().catch(() => ({})) : await res.text();

        if (!res.ok) {
          const msg = (isJson && (body as any)?.error) || `Request failed (${res.status})`;
          return { success: false, error: msg, status: res.status };
        }

        const data = (isJson ? (body as any) : body) as any;
        return { success: true, data: (data?.data ?? data) as T, status: res.status };
      } catch (error: any) {
        return { success: false, error: error?.message || 'Network error' };
      } finally {
        // Clear inflight once resolved
        inflight.delete(dedupeKey);
      }
    })();

    inflight.set(dedupeKey, exec as Promise<ApiResponse<any>>);
    return exec as Promise<ApiResponse<T>>;
  }

  /** GET */
  async get<T = any>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...(options || {}), method: 'GET' });
  }

  /** POST */
  async post<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...(options || {}),
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** PUT */
  async put<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...(options || {}),
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** DELETE */
  async delete<T = any>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...(options || {}), method: 'DELETE' });
  }
}

export const api = new ApiClient();
