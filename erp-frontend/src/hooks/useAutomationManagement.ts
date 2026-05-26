import { useState, useCallback } from 'react';
import { useApi } from './useApi';
import {
  AutomationTemplate,
  BusinessFunction,
  FormSchema,
  WorkflowStep,
} from '../types/automation';

export const useAutomationManagement = () => {
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBusinessFunction = useCallback(
    async (data: Omit<BusinessFunction, 'id'>) => {
      try {
        setLoading(true);
        const response = await api.post('/api/automations/business-functions/', data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to create business function');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const createFormSchema = useCallback(
    async (data: Omit<FormSchema, 'id'>) => {
      try {
        setLoading(true);
        const response = await api.post('/api/automations/forms/', data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to create form schema');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const createWorkflowStep = useCallback(
    async (data: Omit<WorkflowStep, 'id'>) => {
      try {
        setLoading(true);
        const response = await api.post('/api/automations/workflow-steps/', data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to create workflow step');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const createAutomationTemplate = useCallback(
    async (data: Omit<AutomationTemplate, 'id'>) => {
      try {
        setLoading(true);
        const response = await api.post('/api/automations/templates/', data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to create automation template');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const getBusinessFunctions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/automations/business-functions/');
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch business functions');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const getFormSchemas = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/automations/forms/');
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch form schemas');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const getWorkflowSteps = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/automations/workflow-steps/');
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch workflow steps');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const getBusinessFunction = useCallback(
    async (id: number) => {
      try {
        setLoading(true);
        const response = await api.get(`/api/automations/business-functions/${id}/`);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch business function');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const updateBusinessFunction = useCallback(
    async (id: number, data: Partial<BusinessFunction>) => {
      try {
        setLoading(true);
        const response = await api.patch(`/api/automations/business-functions/${id}/`, data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to update business function');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const getFormSchema = useCallback(
    async (id: number) => {
      try {
        setLoading(true);
        const response = await api.get(`/api/automations/forms/${id}/`);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch form schema');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const updateFormSchema = useCallback(
    async (id: number, data: Partial<FormSchema>) => {
      try {
        setLoading(true);
        const response = await api.patch(`/api/automations/forms/${id}/`, data);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to update form schema');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const getRuns = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/automations/runs/');
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch automation runs');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const getRun = useCallback(
    async (id: number) => {
      try {
        setLoading(true);
        const response = await api.get(`/api/automations/runs/${id}/`);
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch automation run');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    createBusinessFunction,
    createFormSchema,
    createWorkflowStep,
    createAutomationTemplate,
    getBusinessFunctions,
    getBusinessFunction,
    updateBusinessFunction,
    getFormSchemas,
    getFormSchema,
    updateFormSchema,
    getWorkflowSteps,
    getRuns,
    getRun,
    clearError,
  };

  const getAutomationTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/automations/templates/');
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch automation templates');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const runAutomation = useCallback(
    async (templateId: number, formData: any) => {
      try {
        setLoading(true);
        const response = await api.post(`/api/automations/templates/${templateId}/run/`, {
          form_data: formData,
        });
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to run automation');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const approveStep = useCallback(
    async (automationRunId: number, stepId: number, comment?: string) => {
      try {
        setLoading(true);
        const response = await api.post(
          `/api/automations/runs/${automationRunId}/steps/${stepId}/approve/`,
          {
            comment,
          }
        );
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to approve step');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const rejectStep = useCallback(
    async (automationRunId: number, stepId: number, reason: string) => {
      try {
        setLoading(true);
        const response = await api.post(
          `/api/automations/runs/${automationRunId}/steps/${stepId}/reject/`,
          {
            reason,
          }
        );
        return response.data;
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to reject step');
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
    createBusinessFunction,
    createFormSchema,
    createWorkflowStep,
    createAutomationTemplate,
    getBusinessFunctions,
    getFormSchemas,
    getWorkflowSteps,
    getAutomationTemplates,
    runAutomation,
    approveStep,
    rejectStep,
    clearError: () => setError(null),
  };
};
