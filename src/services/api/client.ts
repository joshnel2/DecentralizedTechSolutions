/**
 * Core API client utilities.
 * Shared by all domain-specific API modules.
 *
 * Exports: API_URL, ApiError, fetchWithAuth, setAccessToken, getAccessToken
 */

// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// In-memory only token storage.
// Access tokens are NOT persisted to localStorage (XSS-vulnerable).
// Session continuity across page reloads is handled by the httpOnly
// refresh token cookie -- the app calls /auth/refresh on load to get
// a fresh access token.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  // Clean up any legacy localStorage token from before this fix
  try { localStorage.removeItem('apex-access-token'); } catch { /* ignore */ }
}

export function getAccessToken() {
  return accessToken;
}

// API Error class
export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }

  /** True if the server denied access to the resource (forbidden) */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** True if the resource was not found */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True if the user's session has expired */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

// Refresh token -- with dedup to prevent concurrent refresh requests
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in flight, wait for it instead of making a second call
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.accessToken);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    // Clear token on refresh failure
    setAccessToken(null);
    return false;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Base fetch function with auth token injection and automatic refresh on 401.
 */
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // For cookies
  });

  // Handle token refresh on 401.
  // Try refresh even when accessToken is null -- the httpOnly refresh token
  // cookie may still be valid (e.g., after a page reload where the in-memory
  // token was lost). Skip if the failing endpoint IS the refresh endpoint
  // to avoid infinite loops.
  if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
        throw new ApiError(retryResponse.status, error.error || 'Request failed', error);
      }
      
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, error.error || 'Request failed', error);
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
