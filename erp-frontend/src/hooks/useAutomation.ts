// src/hooks/useAutomation.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationService } from '../services/automationService';
import type {
  WorkflowTemplate,
  WorkflowRun,
  WorkflowApproval,
  FormSchema,
  FormSubmission,
} from '../types/automation.types';

// Query Keys
export const automationKeys = {
  all: ['automation'] as const,

  // Templates/Workflows
  templates: () => [...automationKeys.all, 'templates'] as const,
  template: (id: number) => [...automationKeys.templates(), id] as const,

  // Runs
  runs: () => [...automationKeys.all, 'runs'] as const,
  run: (id: number) => [...automationKeys.runs(), id] as const,
  runsList: (filters?: any) => [...automationKeys.runs(), 'list', filters] as const,

  // Approvals
  approvals: () => [...automationKeys.all, 'approvals'] as const,
  approval: (id: number) => [...automationKeys.approvals(), id] as const,
  myApprovals: (status?: string) => [...automationKeys.approvals(), 'my', status] as const,

  // Forms
  forms: () => [...automationKeys.all, 'forms'] as const,
  form: (id: number) => [...automationKeys.forms(), id] as const,
  submissions: () => [...automationKeys.all, 'submissions'] as const,
  mySubmissions: () => [...automationKeys.submissions(), 'my'] as const,
};

// ============= TEMPLATE/WORKFLOW HOOKS =============

export const useWorkflowTemplates = () => {
  return useQuery({
    queryKey: automationKeys.templates(),
    queryFn: () => automationService.getWorkflows(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useWorkflowTemplate = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: automationKeys.template(id),
    queryFn: () => automationService.getWorkflow(id),
    enabled: enabled && !!id,
  });
};

export const useCreateWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<WorkflowTemplate, 'id'>) => automationService.createWorkflow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
};

export const useUpdateWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorkflowTemplate> }) =>
      automationService.updateWorkflow(id, data),
    onSuccess: (updatedTemplate, { id }) => {
      queryClient.setQueryData(automationKeys.template(id), updatedTemplate);
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
};

export const useDeleteWorkflowTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.deleteWorkflow(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: automationKeys.template(deletedId) });
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
};

export const useActivateWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.activateWorkflow(id),
    onSuccess: (_, id) => {
      // Optimistically update the template
      queryClient.setQueryData(automationKeys.template(id), (old: WorkflowTemplate | undefined) =>
        old ? { ...old, is_active: true } : old
      );
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
};

export const useDeactivateWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.deactivateWorkflow(id),
    onSuccess: (_, id) => {
      // Optimistically update the template
      queryClient.setQueryData(automationKeys.template(id), (old: WorkflowTemplate | undefined) =>
        old ? { ...old, is_active: false } : old
      );
      queryClient.invalidateQueries({ queryKey: automationKeys.templates() });
    },
  });
};

// ============= WORKFLOW RUNS HOOKS =============

export const useWorkflowRuns = (filters?: { status?: string; template_id?: number }) => {
  return useQuery({
    queryKey: automationKeys.runsList(filters),
    queryFn: () => automationService.getRuns(filters),
    staleTime: 30 * 1000, // 30 seconds (runs change frequently)
  });
};

export const useWorkflowRun = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: automationKeys.run(id),
    queryFn: () => automationService.getRun(id),
    enabled: enabled && !!id,
    refetchInterval: data => {
      // Auto-refresh if run is still active
      const isActive = data?.status === 'running' || data?.status === 'queued';
      return isActive ? 5000 : false; // 5 seconds
    },
  });
};

export const useCreateWorkflowRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => automationService.createRun(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.runs() });
    },
  });
};

export const useCancelWorkflowRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.cancelRun(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.run(id) });
      queryClient.invalidateQueries({ queryKey: automationKeys.runs() });
    },
  });
};

export const useRetryWorkflowRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.retryRun(id),
    onSuccess: newRun => {
      queryClient.invalidateQueries({ queryKey: automationKeys.runs() });
      if (newRun?.id) {
        queryClient.setQueryData(automationKeys.run(newRun.id), newRun);
      }
    },
  });
};

// ============= APPROVAL HOOKS =============

export const useApprovals = (pendingOnly: boolean = false) => {
  return useQuery({
    queryKey: automationKeys.approvals(),
    queryFn: () => automationService.getApprovals(pendingOnly),
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useMyApprovals = (status?: 'pending' | 'approved' | 'rejected') => {
  return useQuery({
    queryKey: automationKeys.myApprovals(status),
    queryFn: async () => {
      // The service doesn't have getMyApprovals, so we'll use getApprovals for now
      // TODO: Update when backend provides getMyApprovals endpoint
      const allApprovals = await automationService.getApprovals(status === 'pending');
      return allApprovals;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useApproveWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comments }: { id: number; comments?: string }) =>
      automationService.approveWorkflow(id, comments || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: automationKeys.runs() });
    },
  });
};

export const useRejectWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comments }: { id: number; comments: string }) =>
      automationService.rejectWorkflow(id, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: automationKeys.runs() });
    },
  });
};

// ============= FORM HOOKS =============

export const useForms = () => {
  return useQuery({
    queryKey: automationKeys.forms(),
    queryFn: () => automationService.getForms(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useForm = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: automationKeys.form(id),
    queryFn: () => automationService.getForm(id),
    enabled: enabled && !!id,
  });
};

export const useCreateForm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<FormSchema, 'id'>) => automationService.createForm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.forms() });
    },
  });
};

export const useUpdateForm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormSchema> }) =>
      automationService.updateForm(id, data),
    onSuccess: (updatedForm, { id }) => {
      queryClient.setQueryData(automationKeys.form(id), updatedForm);
      queryClient.invalidateQueries({ queryKey: automationKeys.forms() });
    },
  });
};

export const useDeleteForm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => automationService.deleteForm(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: automationKeys.form(deletedId) });
      queryClient.invalidateQueries({ queryKey: automationKeys.forms() });
    },
  });
};

// ============= SUBMISSION HOOKS =============

export const useSubmissions = () => {
  return useQuery({
    queryKey: automationKeys.submissions(),
    queryFn: () => automationService.getSubmissions(),
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useMySubmissions = () => {
  return useQuery({
    queryKey: automationKeys.mySubmissions(),
    queryFn: () => automationService.getMySubmissions(),
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useSubmitForm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ formSchemaId, data }: { formSchemaId: number; data: Record<string, any> }) =>
      automationService.submitForm(formSchemaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.submissions() });
      queryClient.invalidateQueries({ queryKey: automationKeys.mySubmissions() });
    },
  });
};
