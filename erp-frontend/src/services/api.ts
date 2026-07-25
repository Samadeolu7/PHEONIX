// src/services/api.ts
import { tokenManager } from './tokenManager';
import { ErrorHandler } from '../utils/errorHandler';

// Base URL — set VITE_API_BASE_URL in the appropriate .env file.
// Dev:  /api  (Vite dev-server proxy, or point directly to localhost backend)
// Prod: https://api.erp.krystartrust.ng/api  (direct CORS request — no proxy needed)
export const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

const ACTIVE_BRANCH_KEY = 'activeBranch';

export const getHeaders = () => {
  const { accessToken } = tokenManager.getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Director branch override — injected server-side only for elevated roles
  try {
    const raw = localStorage.getItem(ACTIVE_BRANCH_KEY);
    if (raw) {
      const branch = JSON.parse(raw) as { id: number };
      if (branch?.id) {
        headers['X-Branch-ID'] = String(branch.id);
      }
    }
  } catch {
    // ignore parse errors
  }

  return headers;
};

// Enhanced fetch wrapper with comprehensive error handling
const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const fullUrl = `${BASE_URL}${url}`;

  try {
    // Check if this is a FormData request (body is FormData)
    const isFormData = options.body instanceof FormData;

    // Get base headers, but exclude Content-Type for FormData requests
    const baseHeaders = getHeaders();
    if (isFormData) {
      delete baseHeaders['Content-Type']; // Let browser set Content-Type with boundary for FormData
    }

    // First attempt
    let response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...baseHeaders,
        ...options.headers,
      },
    });

    // If 401 and we have a refresh token, try to refresh and retry
    if (response.status === 401) {
      const refreshSuccess = await tokenManager.refreshToken();

      if (refreshSuccess) {
        // Get fresh headers for retry, again excluding Content-Type for FormData
        const retryHeaders = getHeaders();
        if (isFormData) {
          delete retryHeaders['Content-Type'];
        }

        // Retry the original request with new token
        response = await fetch(fullUrl, {
          ...options,
          headers: {
            ...retryHeaders,
            ...options.headers,
          },
        });
      }
    }

    return response;
  } catch (error) {
    // Handle network errors, timeouts, etc.
    throw ErrorHandler.classifyError(error);
  }
};

// DRF field-validation errors come back shaped like
// {"source_cashier_account": ["Invalid pk \"3\" - object does not exist."]}
// — no top-level "message" or "detail" key. Flatten that shape into a
// readable string so real validation reasons aren't silently dropped in
// favor of a generic fallback message.
const flattenDrfErrors = (errorDetails: any): string | null => {
  if (!errorDetails || typeof errorDetails !== 'object') return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(errorDetails)) {
    const text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : null;
    if (!text) continue;
    parts.push(key === 'non_field_errors' ? text : `${key}: ${text}`);
  }
  return parts.length ? parts.join(' | ') : null;
};

// Enhanced response handler with detailed error information
const handleResponse = async (response: Response): Promise<any> => {
  if (!response.ok) {
    let errorDetails: any = {};

    try {
      // Try to parse error response body
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        errorDetails = await response.json();
      } else {
        errorDetails = { message: await response.text() };
      }
    } catch (parseError) {
      // If we can't parse the error response, use status text
      errorDetails = { message: response.statusText };
    }

    // Create comprehensive error object
    const error = {
      status: response.status,
      statusText: response.statusText,
      message:
        errorDetails.message ||
        errorDetails.detail ||
        flattenDrfErrors(errorDetails) ||
        response.statusText,
      details: errorDetails,
      response: {
        status: response.status,
        data: errorDetails,
      },
    };

    throw error;
  }

  // Handle successful responses
  const contentType = response.headers.get('content-type');

  // Handle empty responses (204 No Content)
  if (response.status === 204 || !contentType || !contentType.includes('application/json')) {
    return null;
  }

  // Parse JSON response
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (parseError) {
    console.warn('Failed to parse response as JSON:', parseError);
    return null;
  }
};

export const api = {
  get: async (url: string, options?: { params?: Record<string, any> }) => {
    let requestUrl = url;

    // Add query parameters if provided
    if (options?.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        requestUrl += `?${queryString}`;
      }
    }

    const response = await fetchWithAuth(requestUrl);
    return handleResponse(response);
  },

  post: async (url: string, data?: any) => {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  put: async (url: string, data?: any) => {
    const response = await fetchWithAuth(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  patch: async (url: string, data?: any) => {
    const response = await fetchWithAuth(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  delete: async (url: string) => {
    const response = await fetchWithAuth(url, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  postFormData: async (url: string, formData: FormData) => {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: {}, // Don't set Content-Type for FormData - browser will set it with boundary
      body: formData,
    });
    return handleResponse(response);
  },

  patchFormData: async (url: string, formData: FormData) => {
    const response = await fetchWithAuth(url, {
      method: 'PATCH',
      headers: {}, // Don't set Content-Type for FormData - browser will set it with boundary
      body: formData,
    });
    return handleResponse(response);
  },

  /**
   * Fetch a binary resource (e.g. an Excel file) and return a Blob.
   * Triggers a browser file-save dialog when combined with triggerDownload().
   */
  getBlob: async (url: string, options?: { params?: Record<string, any> }): Promise<Blob> => {
    let requestUrl = url;
    if (options?.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) requestUrl += `?${queryString}`;
    }
    const response = await fetchWithAuth(requestUrl);
    if (!response.ok) {
      // Try to read a JSON error body, otherwise throw a generic error
      let msg = response.statusText;
      try {
        const j = await response.json();
        msg = j.detail || msg;
      } catch (_) {
        /* ignore */
      }
      throw { status: response.status, message: msg };
    }
    return response.blob();
  },
};

/**
 * Extract the array out of a list/paginated endpoint's response, whatever
 * shape it happens to be in. api.get() returns the parsed JSON body
 * directly — there is no axios-style {data: ...} wrapper — but list
 * endpoints across this backend still return one of three different
 * envelopes depending on which viewset served them:
 *   - a bare array (an unpaginated ViewSet's default .list())
 *   - {results, total, page, pages}   (this codebase's custom paginator,
 *     e.g. threads/views.py's ThreadViewSet.list())
 *   - {count, next, previous, results}  (DRF's default pagination)
 *
 * Every one of those has a `results` key except the bare-array case, so
 * checking Array.isArray(res) and Array.isArray(res?.results) covers all
 * three. Use this instead of hand-rolling the check per service — a
 * version of that check without a fallback to the bare-array case is
 * exactly what silently broke threadService.ts's list()/listMessages()/
 * listParticipants() and collectionSheetService.ts wholesale: both checked
 * res.data (assuming axios-style wrapping, which this client never does)
 * and gave up instead of ever trying `res` itself.
 */
export function unwrapList<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.results)) return res.results;
  return [];
}

/**
 * Programmatically trigger a browser file-save dialog for a Blob.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export default api;
