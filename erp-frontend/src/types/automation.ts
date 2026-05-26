import type { FormSchema } from './forms';
export type { FormSchema } from './forms';

export interface WorkflowAction {
  id: string;
  name: string;
  description?: string;
  type:
    | 'api'
    | 'database'
    | 'system'
    | 'custom'
    | 'notification'
    | 'condition'
    | 'delay'
    | 'api_call'
    | 'transaction';
  config: any; // WorkflowActionConfig
  order: number;
  position?: { x: number; y: number };
  nextActions?: {
    success?: string; // ID of next action on success
    failure?: string; // ID of next action on failure
    conditions?: Array<{
      condition: string; // Expression to evaluate
      nextActionId: string; // ID of next action if condition is true
    }>;
  };
  transactionConfig?: {
    type: 'loan_disbursement' | 'income_record' | 'liability_record';
    accountIds: string[];
    amount: number | string; // Can be fixed or reference to form field
  };
}

export interface ApprovalStep {
  id: string;
  name: string;
  label: string;
  level: number;
  approvers: string[];
  requiresAll: boolean;
  allowComments: boolean;
  order: number;
  onApprove: {
    nextStepId?: string;
    actions: string[]; // IDs of workflow actions to execute
  };
  onReject: {
    nextStepId?: string;
    actions: string[]; // IDs of workflow actions to execute
  };
  validationRules?: {
    requiredFields: string[];
    conditions: string[]; // Expressions that must evaluate to true
  };
}

export interface AutomationTemplate {
  id: number;
  name: string;
  description: string;
  formSchema?: FormSchema;
  requiresApproval: boolean;
  workflow: WorkflowAction[];
  approvalSteps: ApprovalStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  schedulingEnabled: boolean;
  steps: WorkflowStep[];
}

export interface AutomationRun {
  id: number;
  template: AutomationTemplate;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  created_at: string;
  updated_at: string;
  current_step: WorkflowStep;
  startedAt: string;
  endedAt?: string;
  error?: string;
  error_message?: string;
  completedSteps: WorkflowStep[];
  logs: AutomationLog[];
  data?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface WorkflowStep {
  id: number;
  label: string;
  type: 'approval' | 'automated';
  order: number;
}

export interface BusinessFunction {
  id: number;
  name: string;
  friendly_name: string;
  description: string;
  type: string;
  function_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface Account {
  id: number;
  name: string;
  type: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ScheduleConfig {
  id: string;
  name: string;
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;
  startDate: string;
  endDate?: string;
  automationId: string;
  isActive: boolean;
}

export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
  submittedBy: string;
  submittedAt: string;
  currentStep?: string;
  approvals: ApprovalRecord[];
}

export interface ApprovalRecord {
  id: string;
  stepId: string;
  approver: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  timestamp: string;
}

export interface AutomationLog {
  id: number;
  runId: number;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}
