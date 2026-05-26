/**
 * Utility to make authenticated fetch requests
 * Automatically adds Authorization header with JWT token
 */

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('accessToken');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Helper for GET requests
 */
export async function getWithAuth(url: string): Promise<any> {
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Helper for POST requests
 */
export async function postWithAuth(url: string, data: any): Promise<any> {
  const response = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Helper for PUT requests
 */
export async function putWithAuth(url: string, data: any): Promise<any> {
  const response = await fetchWithAuth(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Helper for PATCH requests
 */
export async function patchWithAuth(url: string, data: any): Promise<any> {
  const response = await fetchWithAuth(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Helper for DELETE requests
 */
export async function deleteWithAuth(url: string): Promise<void> {
  const response = await fetchWithAuth(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
