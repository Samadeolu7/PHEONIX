export type FormFieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'money'
  | 'account_select'; // Cascading account selector

export interface ValidationRules {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  options?: string[];
  validation?: ValidationRules;
  default?: any; // Backend sends 'default' for initial values
  defaultValue?: any; // Legacy/compatibility support
  helpText?: string;
  required?: boolean;
  readonly?: boolean; // For readonly fields
  metadata?: {
    help_text?: string;
    field_type?: string;
    pre_selected?: boolean;
    filter_parent_id?: number; // For filtering child accounts by parent
  };
}

export interface FormSchema {
  id?: number;
  name: string;
  description: string;
  trigger_event_name: string;
  schema: {
    fields: FormField[];
  };
  fields?: FormField[]; // Compatibility with forms.ts FormSchema
  created_at?: string;
  updated_at?: string;
}

export type FormValues = Record<string, any>;
export type FormErrors = Record<string, string>;

// Workflow types
export type WorkflowStepType =
  | 'query'
  | 'condition'
  | 'calculation'
  | 'transaction'
  | 'notification'
  | 'api_call'
  | 'update'
  | 'approval'
  | 'sub_workflow'
  | 'terminal_condition'
  | 'approval_step';

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  config: Record<string, any>;
  next?: string;
  on_true?: string;
  on_false?: string;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  initial_step: string;
}

export interface WorkflowTemplate {
  id?: number;
  name: string;
  description: string;
  trigger_type: 'event' | 'schedule' | 'manual';
  trigger_config: {
    event_name?: string;
    filters?: Record<string, any>;
    cron?: string;
  };
  workflow_definition: WorkflowDefinition;
  requires_approval: boolean;
  requiresApproval?: boolean; // camelCase alias for requires_approval
  approval_config?: {
    at_step: string;
    required_roles: string[];
    timeout_hours?: number;
  };
  is_active: boolean;
  version?: number;
  created_at?: string;
  // Additional properties used by AutomationRunForm
  initialStep?: string | { label: string };
  initial_step?: string | { label: string };
  finalStep?: string | { label: string };
  final_step?: string | { label: string };
  formSchema?: any;
  form_schema?: any;
}

// Submission types
export interface FormSubmission {
  id: number;
  submission_reference: string;
  form_schema: {
    id: number;
    name: string;
  };
  data: Record<string, any>;
  status: 'submitted' | 'processing' | 'completed' | 'failed';
  submitted_at: string;
}

// Workflow run types
export interface WorkflowRun {
  id: number;
  run_reference: string;
  template: {
    id: number;
    name: string;
  };
  status: 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  current_step_id: string;
  context: Record<string, any>;
  execution_log: Array<{
    timestamp: string;
    step_id: string;
    status: string;
    result?: any;
    error?: string;
  }>;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  form_submission_reference?: string;
}

// Approval types
export interface WorkflowApproval {
  id: number;
  run: {
    id: number;
    run_reference: string;
  };
  template_name: string;
  step_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  required_roles: string[];
  requested_at: string;
  expires_at?: string;
  responded_at?: string;
  responded_by?: {
    id: number;
    name: string;
  };
  comments?: string;
}

// User types
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'sys_admin';
  tenant: string;
}

// Approval request types
export interface ApprovalRequest {
  id: number;
  run_id: number;
  step_id: string;
  step?: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  responded_at?: string;
  comments?: string;
  respondedBy?: { id: number; name: string };
}

export interface AutomationRun {
  id: number;
  run_reference: string;
  runReference?: string;
  status: 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
  current_step_id: string;
  context: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface ApprovalActionRequest {
  approval_id: number;
  action: 'approve' | 'reject';
  comments?: string;
}

export interface CreateAutomationRunRequest {
  template_id: number;
  context: Record<string, any>;
}

// Action types
export interface WorkflowAction {
  id: string;
  type:
    | 'condition'
    | 'transaction'
    | 'notification'
    | 'api_call'
    | 'system'
    | 'custom'
    | 'api'
    | 'database'
    | 'delay'
    | 'approval';
  name: string;
  description: string;
  order: number;
  config: {
    notificationTemplate?: string;
    recipients?: string[];
    approvers?: string[];
    conditions?: any[];
    delay?: number;
    [key: string]: any;
  };
  position: { x: number; y: number };
}

export interface ApprovalStep {
  id: string;
  name: string;
  approvers: string[];
  timeout_hours?: number;
}

// Alias for compatibility
export type AutomationTemplate = WorkflowTemplate;
