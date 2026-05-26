// src/hooks/useApi.ts
import { useState, useCallback } from 'react';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  loading: boolean;
}

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (method: string, endpoint: string, data?: any) => {
    try {
      setLoading(true);
      setError(null);

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          // Add auth token if needed
          // 'Authorization': `Bearer ${getToken()}`,
        },
      };

      if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(endpoint, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    get: (endpoint: string) => request('GET', endpoint),
    post: (endpoint: string, data: any) => request('POST', endpoint, data),
    patch: (endpoint: string, data: any) => request('PATCH', endpoint, data),
    delete: (endpoint: string) => request('DELETE', endpoint),
  };
};

// Simple API service for direct use
export const api = {
  get: async (endpoint: string) => {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  post: async (endpoint: string, data: any) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  patch: async (endpoint: string, data: any) => {
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  delete: async (endpoint: string) => {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
};
