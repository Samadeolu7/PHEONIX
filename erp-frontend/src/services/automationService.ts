// src/services/automationService.ts
import {
  FormSchema,
  FormSubmission,
  WorkflowTemplate,
  WorkflowRun,
  WorkflowApproval,
} from '../types/automation.types';
import { api } from './api';

const BASE_URL = '/api/automations';

export interface WorkflowSummary {
  id: string;
  name: string;
  workflow_type: 'system' | 'template' | 'standard' | 'custom';
  access_level: 'public' | 'internal' | 'restricted' | 'private';
  version: number;
  is_atomic: boolean;
  category: string;
  description: string;
  required_inputs: Array<{
    name: string;
    type: string;
    description: string;
    validation?: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  estimated_duration_ms: number;
  usage_count: number;
}

export interface ExecutionTree {
  id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_type: string;
  depth: number;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  steps: Array<{
    id: string;
    step_id: string;
    step_name: string;
    step_type: string;
    status: string;
    started_at: string;
    completed_at?: string;
    duration_ms: number;
    input_data: any;
    output_data: any;
    variables_snapshot: Record<string, any>;
    error_message?: string;
    retry_count: number;
  }>;
  sub_workflows: ExecutionTree[];
  metrics: {
    total_steps: number;
    failed_steps: number;
    sub_workflows_called: number;
  };
}

export interface ComplexityValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  complexity: {
    steps: number;
    max_depth: number;
    branches: number;
    sub_workflows: number;
  };
}

// Helper to handle API responses that might be paginated or wrapped
function extractData<T>(response: any): T[] {
  if (Array.isArray(response)) return response;
  if (response && response.results && Array.isArray(response.results)) return response.results;
  if (response && response.data && Array.isArray(response.data)) return response.data;
  if (response && typeof response === 'object') return [response];
  return [];
}

type RequestOpts = { method?: string; body?: any; headers?: Record<string, string> };

class AutomationService {
  // ============= Forms =============
  async getForms(): Promise<FormSchema[]> {
    const data = await api.get('/automations/forms/');
    return extractData<FormSchema>(data);
  }

  async getForm(id: number): Promise<FormSchema> {
    return api.get(`/automations/forms/${id}/`);
  }

  async createForm(data: Omit<FormSchema, 'id'>): Promise<FormSchema> {
    return api.post('/automations/forms/', data);
  }

  async updateForm(id: number, data: Partial<FormSchema>): Promise<FormSchema> {
    return api.put(`/automations/forms/${id}/`, data);
  }

  async deleteForm(id: number): Promise<void> {
    await api.delete(`/automations/forms/${id}/`);
  }

  // ============= Submissions =============
  async submitForm(formSchemaId: number, data: Record<string, any>): Promise<FormSubmission> {
    return api.post('/automations/form-submissions/', { form_schema: formSchemaId, data });
  }

  async getSubmissions(): Promise<FormSubmission[]> {
    const data = await api.get('/automations/form-submissions/');
    return extractData<FormSubmission>(data);
  }

  async getMySubmissions(): Promise<FormSubmission[]> {
    const data = await api.get('/automations/form-submissions/my_submissions/');
    return extractData<FormSubmission>(data);
  }

  async getSubmission(id: number): Promise<FormSubmission> {
    return api.get(`/automations/form-submissions/${id}/`);
  }

  // ============= Workflows =============
  async getWorkflows(): Promise<WorkflowTemplate[]> {
    const data = await api.get('/automations/workflows/');
    return extractData<WorkflowTemplate>(data);
  }

  async getWorkflow(id: number): Promise<WorkflowTemplate> {
    return api.get(`/automations/workflows/${id}/`);
  }

  async createWorkflow(data: Omit<WorkflowTemplate, 'id'>): Promise<WorkflowTemplate> {
    return api.post('/automations/workflows/', data);
  }

  async updateWorkflow(id: number, data: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> {
    return api.put(`/automations/workflows/${id}/`, data);
  }

  async deleteWorkflow(id: number): Promise<void> {
    await api.delete(`/automations/workflows/${id}/`);
  }

  async activateWorkflow(id: number): Promise<void> {
    await api.post(`/automations/workflows/${id}/activate/`, {});
  }

  async deactivateWorkflow(id: number): Promise<void> {
    await api.post(`/automations/workflows/${id}/deactivate/`, {});
  }

  // ============= Workflow Runs =============
  async getRuns(filters?: { status?: string; template_id?: number }): Promise<WorkflowRun[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.template_id) params.append('template_id', String(filters.template_id));
    const data = await api.get(`/automations/runs/?${params.toString()}`);
    return extractData<WorkflowRun>(data);
  }

  async getRun(id: number): Promise<WorkflowRun> {
    return api.get(`/automations/runs/${id}/`);
  }

  async cancelRun(id: number): Promise<void> {
    await api.post(`/automations/runs/${id}/cancel/`, {});
  }

  async retryRun(id: number): Promise<WorkflowRun> {
    return api.post(`/automations/runs/${id}/retry/`, {});
  }

  async createRun(data: any): Promise<any> {
    return api.post('/automations/runs/', data);
  }

  // ============= Approvals =============
  async getApprovals(pendingOnly: boolean = false): Promise<WorkflowApproval[]> {
    const params = pendingOnly ? '?pending_only=true' : '';
    const data = await api.get(`/automations/approvals/${params}`);
    return extractData<WorkflowApproval>(data);
  }

  async approveWorkflow(id: number, comments: string = ''): Promise<WorkflowApproval> {
    return api.post(`/automations/approvals/${id}/approve/`, { comments });
  }

  async rejectWorkflow(id: number, comments: string): Promise<WorkflowApproval> {
    return api.post(`/automations/approvals/${id}/reject/`, { comments });
  }

  // ============= Legacy/Template Support =============
  async getTemplates(): Promise<WorkflowTemplate[]> {
    try {
      return await this.getWorkflows();
    } catch (error) {
      const data = await api.get('/automations/templates/');
      return extractData<WorkflowTemplate>(data);
    }
  }

  async getTemplate(id: number): Promise<WorkflowTemplate> {
    try {
      return await this.getWorkflow(id);
    } catch (error) {
      return api.get(`/automations/templates/${id}/`);
    }
  }

  // ============= Automation Template Support =============
  async getAutomationTemplates(): Promise<WorkflowTemplate[]> {
    return await this.getWorkflows();
  }

  async createAutomationTemplate(data: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> {
    return await this.createWorkflow(data as Omit<WorkflowTemplate, 'id'>);
  }

  async updateAutomationTemplate(
    id: number,
    data: Partial<WorkflowTemplate>
  ): Promise<WorkflowTemplate> {
    return await this.updateWorkflow(id, data);
  }

  // ============= Extra helpers =============
  async getWhitelistedFunctions(): Promise<{ functions: string[] }> {
    const res = await api.get('/automations/functions/');
    if (res?.data?.functions) return res.data;
    if (res?.functions) return { functions: res.functions };
    return res;
  }

  async getNotificationTemplates(type: string): Promise<{ templates: any[] }> {
    const res = await api.get(`/automations/notification-templates/${encodeURIComponent(type)}/`);
    if (res?.data?.templates) return res.data;
    if (res?.templates) return { templates: res.templates };
    return res;
  }

  async getAllowedTransactionTypes(): Promise<{ types: string[] }> {
    const res = await api.get('/automations/transaction-types/');
    if (res?.data?.types) return res.data;
    if (res?.types) return { types: res.types };
    return res;
  }

  async validateWorkflow(workflow: WorkflowTemplate): Promise<any> {
    const res = await api.post('/automations/workflows/validate/', workflow);
    if (res?.data) return res.data;
    return res;
  }

  async getCallableWorkflows(): Promise<{ workflows: WorkflowSummary[] }> {
    return api.get('/automations/workflows/callable/');
  }

  async getSystemWorkflows(): Promise<{ workflows: WorkflowSummary[] }> {
    return api.get('/automations/workflows/system/');
  }

  async getExecutionTree(executionId: string): Promise<ExecutionTree> {
    return api.get(`/automations/workflows/${executionId}/execution_tree/`);
  }

  async validateComplexity(
    workflowDefinition: any,
    workflowType: string = 'standard'
  ): Promise<ComplexityValidation> {
    return api.post('/automations/workflows/validate_complexity/', {
      workflow_definition: workflowDefinition,
      workflow_type: workflowType,
    });
  }

  async getApprovalRoles(): Promise<{ roles: string[] }> {
    return api.get('/automations/approval-roles/');
  }

  async executeWorkflowTest(
    workflowId: string,
    testData: any
  ): Promise<{
    execution_id: string;
    status: string;
    result: any;
  }> {
    return api.post(`/automations/workflows/${workflowId}/test/`, {
      test_data: testData,
    });
  }

  async getWorkflowMetrics(
    workflowId: string,
    days: number = 30
  ): Promise<{
    total_executions: number;
    success_rate: number;
    average_duration_ms: number;
    p95_duration_ms: number;
    error_rate: number;
  }> {
    return api.get(`/automations/workflows/${workflowId}/metrics/`, { days });
  }

  async getAccountHierarchy(params?: {
    parent_only?: boolean;
    parent_code?: string;
    account_type?: string;
  }): Promise<{
    parents?: Array<{
      id: number;
      code: string;
      name: string;
      account_type: string;
      balance: string;
      children_count: number;
      children?: any[];
    }>;
    parent?: any;
    children?: any[];
    total_count?: number;
  }> {
    return api.get('/automations/accounts/hierarchy/', params);
  }

  async getEntityFields(entityName: string): Promise<{
    fields: Array<{
      name: string;
      type: string;
      filterable: boolean;
      updatable: boolean;
      operators: string[];
      is_relation?: boolean;
      is_hierarchical?: boolean;
      hierarchy_type?: string;
      computed?: boolean;
      description?: string;
    }>;
    supports_hierarchy: boolean;
  }> {
    return api.get(`/automations/entities/${entityName}/fields/`);
  }

  async getWhitelistedEntities(): Promise<{
    entities: Array<{
      name: string;
      label: string;
      supports_hierarchy: boolean;
    }>;
  }> {
    return api.get('/automations/entities/');
  }
}

export const automationService = new AutomationService();
