import { FormSchema } from '../forms';

export type WorkflowActionType =
  | 'api'
  | 'database'
  | 'system'
  | 'custom'
  | 'notification'
  | 'condition'
  | 'delay'
  | 'api_call';

export type AutomationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface Position {
  x: number;
  y: number;
}

export interface WorkflowAction {
  id: string;
  name: string;
  description?: string;
  type: WorkflowActionType;
  config: Record<string, any>;
  order: number;
  position?: Position;
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
}

export interface WorkflowStep {
  id: string;
  label: string;
  type: 'approval' | 'automated';
  order: number;
  config?: Record<string, any>;
}

export interface AutomationTemplate {
  id: string;
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
  id: string;
  template: AutomationTemplate;
  status: AutomationStatus;
  createdAt: string;
  updatedAt: string;
  currentStep: WorkflowStep;
  startedAt: string;
  endedAt?: string;
  error?: string;
  errorMessage?: string;
  completedSteps: WorkflowStep[];
  logs: AutomationLog[];
  data?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface AutomationLog {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
  stepId?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessFunction {
  id: string;
  name: string;
  friendlyName: string;
  description: string;
  type: string;
  functionType: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
