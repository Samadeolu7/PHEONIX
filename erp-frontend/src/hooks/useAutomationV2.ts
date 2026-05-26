// src/hooks/useAutomationV2.ts
import { useState, useCallback, useMemo } from 'react';
import {
  AutomationTemplate,
  WorkflowStep,
  Account,
  AutomationRun,
  PaginatedResponse,
} from '../types/automation';

import { env } from '../config/env';

const API_BASE = env.API_BASE;

// Global cache
let accessToken: string | null = null;
let globalCache = {
  workflowSteps: [] as WorkflowStep[],
  accounts: [] as Account[],
};

// Development credentials - REMOVE IN PRODUCTION
const DEV_CREDENTIALS = {
  username: 'samuel',
  password: 'password677',
};

async function getAuthToken() {
  if (accessToken) {
    return accessToken;
  }

  const response = await fetch(`${API_BASE}/api/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(DEV_CREDENTIALS),
  });

  if (!response.ok) {
    throw new Error('Authentication failed');
  }

  const data = await response.json();
  accessToken = data.access;
  return accessToken;
}

export const useAutomation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a single memoized API object
  const api = useMemo(
    () => ({
      async request<T>(url: string, options: RequestInit = {}): Promise<T> {
        const token = await getAuthToken();
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`API error ${response.status}: ${text}`);
        }

        return response.json();
      },
    }),
    []
  );

  // Memoized data fetchers
  const fetchWorkflowSteps = useCallback(async (): Promise<WorkflowStep[]> => {
    if (globalCache.workflowSteps.length > 0) {
      return globalCache.workflowSteps;
    }

    setLoading(true);
    try {
      const data = await api.request<PaginatedResponse<WorkflowStep>>(
        `${API_BASE}/api/automations/workflow-steps/`
      );
      globalCache.workflowSteps = data.results || [];
      return globalCache.workflowSteps;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchAccounts = useCallback(async (): Promise<Account[]> => {
    if (globalCache.accounts.length > 0) {
      return globalCache.accounts;
    }

    setLoading(true);
    try {
      const data = await api.request<PaginatedResponse<Account>>(
        `${API_BASE}/api/accounts/accounts`
      );
      globalCache.accounts = data.results || [];
      return globalCache.accounts;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchTemplates = useCallback(async (): Promise<AutomationTemplate[]> => {
    setLoading(true);
    try {
      const data = await api.request<PaginatedResponse<AutomationTemplate>>(
        `${API_BASE}/api/automations/automation-templates/`
      );
      return data.results || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const createTemplate = useCallback(
    async (template: {
      name: string;
      description: string;
      requires_approval: boolean;
      initial_step_id: number;
      final_step_id: number;
      mappings: {
        step_id: number;
        debit_account_id?: number;
        credit_account_id?: number;
      }[];
    }): Promise<AutomationTemplate> => {
      setLoading(true);
      try {
        return await api.request<AutomationTemplate>(`${API_BASE}/api/automations/templates/`, {
          method: 'POST',
          body: JSON.stringify(template),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const startRun = useCallback(
    async (templateId: number, parameters: Record<string, any>): Promise<AutomationRun> => {
      setLoading(true);
      try {
        return await api.request<AutomationRun>(
          `${API_BASE}/api/automations/templates/${templateId}/runs/`,
          {
            method: 'POST',
            body: JSON.stringify({ parameters }),
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  return {
    loading,
    error,
    fetchWorkflowSteps,
    fetchAccounts,
    fetchTemplates,
    createTemplate,
    startRun,
  };
};
