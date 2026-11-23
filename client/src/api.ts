export interface ApiErrorPayload {
  code: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, error: ApiErrorPayload) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.status = status;
  }
}

const TOKEN_KEY = 'syncspace_token';

let inMemoryToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setAuthToken(null);
    const currentPath = window.location.pathname;
    if (
      !currentPath.startsWith('/login') &&
      !currentPath.startsWith('/register') &&
      !currentPath.startsWith('/invite')
    ) {
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    }
  }

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorPayload: ApiErrorPayload = data?.error || {
      code: 'REQUEST_FAILED',
      message: data?.message || response.statusText || 'Request failed',
    };
    throw new ApiError(response.status, errorPayload);
  }

  return data as T;
}
