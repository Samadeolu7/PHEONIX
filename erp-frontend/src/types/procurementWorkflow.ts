// Procurement Workflow Integration Types
import {
  RequisitionStatus,
  ApprovalStatus,
  PurchaseRequisition,
  GoodsReceivedNote,
  PurchaseReturn,
  User,
} from './procurement';

// Workflow Status Tracking
export interface WorkflowStatusInfo {
  id: string;
  entity_type: 'requisition' | 'grn' | 'return';
  entity_id: number;
  workflow_run_id?: string;
  current_step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress_percentage: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  steps: WorkflowStepStatus[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowStepStatus {
  id: string;
  step_name: string;
  step_type: 'approval' | 'notification' | 'system_action' | 'integration';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  assignee_id?: number;
  assignee?: User;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  comments?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  metadata?: Record<string, any>;
}

// Email Notification Types
export interface EmailNotificationConfig {
  template_name: string;
  recipients: EmailRecipient[];
  subject: string;
  variables: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  send_immediately: boolean;
  scheduled_at?: string;
}

export interface EmailRecipient {
  type: 'user' | 'role' | 'email';
  identifier: string; // user_id, role_name, or email address
  name?: string;
}

export interface EmailNotificationStatus {
  id: string;
  config: EmailNotificationConfig;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at?: string;
  error_message?: string;
  delivery_status?: 'delivered' | 'bounced' | 'opened' | 'clicked';
  retry_count: number;
  created_at: string;
  updated_at: string;
}

// Approval Workflow Types
export interface ApprovalWorkflowConfig {
  id: string;
  name: string;
  entity_type: 'requisition' | 'grn' | 'return';
  trigger_conditions: ApprovalTriggerCondition[];
  approval_steps: ApprovalWorkflowStep[];
  notification_settings: NotificationSettings;
  escalation_rules: EscalationRule[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalTriggerCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
  value: any;
  logical_operator?: 'and' | 'or';
}

export interface ApprovalWorkflowStep {
  id: string;
  step_order: number;
  name: string;
  description?: string;
  approver_type: 'user' | 'role' | 'department_head' | 'budget_owner';
  approver_identifiers: string[]; // user_ids, role_names, etc.
  approval_type: 'any' | 'all' | 'majority';
  is_required: boolean;
  timeout_hours?: number;
  auto_approve_conditions?: ApprovalTriggerCondition[];
  on_approve_actions: WorkflowAction[];
  on_reject_actions: WorkflowAction[];
  on_timeout_actions: WorkflowAction[];
}

export interface WorkflowAction {
  type: 'email_notification' | 'status_update' | 'system_integration' | 'escalation';
  config: Record<string, any>;
  delay_minutes?: number;
}

export interface NotificationSettings {
  notify_on_submit: boolean;
  notify_on_approve: boolean;
  notify_on_reject: boolean;
  notify_on_timeout: boolean;
  notify_requester: boolean;
  notify_approvers: boolean;
  notify_watchers: boolean;
  custom_recipients: EmailRecipient[];
}

export interface EscalationRule {
  id: string;
  trigger_after_hours: number;
  escalate_to_type: 'user' | 'role' | 'manager';
  escalate_to_identifiers: string[];
  notification_template: string;
  max_escalations: number;
  escalation_interval_hours: number;
}

// Workflow Integration Requests/Responses
export interface StartWorkflowRequest {
  entity_type: 'requisition' | 'grn' | 'return';
  entity_id: number;
  workflow_type: 'approval' | 'notification' | 'integration';
  trigger_data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduled_at?: string;
}

export interface WorkflowActionRequest {
  workflow_status_id: string;
  action: 'approve' | 'reject' | 'cancel' | 'retry' | 'escalate';
  comments?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowStatusUpdate {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  current_step?: string;
  progress_percentage?: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

// Automatic Status Update Configuration
export interface AutoStatusUpdateConfig {
  id: string;
  entity_type: 'requisition' | 'grn' | 'return';
  trigger_event: string; // e.g., 'approval_completed', 'grn_posted', 'return_processed'
  conditions: ApprovalTriggerCondition[];
  target_status: string;
  additional_actions: WorkflowAction[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Workflow Analytics and Reporting
export interface WorkflowMetrics {
  entity_type: 'requisition' | 'grn' | 'return';
  period_start: string;
  period_end: string;
  total_workflows: number;
  completed_workflows: number;
  failed_workflows: number;
  cancelled_workflows: number;
  average_completion_time_hours: number;
  approval_rates: {
    step_name: string;
    approval_rate: number;
    average_time_hours: number;
  }[];
  bottlenecks: {
    step_name: string;
    average_delay_hours: number;
    timeout_rate: number;
  }[];
}

// Integration with existing procurement types
export interface RequisitionWithWorkflow extends PurchaseRequisition {
  workflow_status?: WorkflowStatusInfo;
  pending_approvals?: ApprovalWorkflowStep[];
  notification_history?: EmailNotificationStatus[];
}

export interface GRNWithWorkflow extends GoodsReceivedNote {
  workflow_status?: WorkflowStatusInfo;
  integration_status?: {
    inventory_posted: boolean;
    accounting_posted: boolean;
    notifications_sent: boolean;
  };
}

export interface ReturnWithWorkflow extends PurchaseReturn {
  workflow_status?: WorkflowStatusInfo;
  approval_required: boolean;
  processing_status?: {
    supplier_notified: boolean;
    credit_note_processed: boolean;
    inventory_adjusted: boolean;
  };
}

// Workflow Template Types for Procurement
export interface ProcurementWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  entity_type: 'requisition' | 'grn' | 'return';
  template_type: 'approval' | 'notification' | 'integration' | 'composite';
  workflow_definition: {
    steps: WorkflowTemplateStep[];
    variables: WorkflowVariable[];
    conditions: WorkflowCondition[];
  };
  default_config: Record<string, any>;
  is_system_template: boolean;
  is_active: boolean;
  usage_count: number;
  created_by: User;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateStep {
  id: string;
  name: string;
  type: 'approval' | 'notification' | 'system_action' | 'condition' | 'delay';
  config: Record<string, any>;
  order: number;
  parallel_execution: boolean;
  timeout_minutes?: number;
  retry_config?: {
    max_retries: number;
    retry_delay_minutes: number;
    retry_on_failure_only: boolean;
  };
  success_conditions?: WorkflowCondition[];
  failure_conditions?: WorkflowCondition[];
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  default_value?: any;
  required: boolean;
  description?: string;
  validation_rules?: Record<string, any>;
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'exists';
  value: any;
  logical_operator?: 'and' | 'or';
}

// Validation and Helper Types
export const WORKFLOW_ENTITY_TYPES = ['requisition', 'grn', 'return'] as const;
export const WORKFLOW_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export const WORKFLOW_STEP_TYPES = [
  'approval',
  'notification',
  'system_action',
  'integration',
] as const;
export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

// Helper functions for workflow status
export const getWorkflowStatusColor = (status: WorkflowStatus): string => {
  switch (status) {
    case 'pending':
      return 'yellow';
    case 'in_progress':
      return 'blue';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'cancelled':
      return 'gray';
    default:
      return 'gray';
  }
};

export const getWorkflowStatusLabel = (status: WorkflowStatus): string => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

export const calculateWorkflowProgress = (steps: WorkflowStepStatus[]): number => {
  if (steps.length === 0) return 0;

  const completedSteps = steps.filter(
    step => step.status === 'completed' || step.status === 'skipped'
  ).length;

  return Math.round((completedSteps / steps.length) * 100);
};
