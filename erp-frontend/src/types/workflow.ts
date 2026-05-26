export interface Variable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  source: 'form' | 'step' | 'calculated';
  path: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'query' | 'condition' | 'calculation' | 'transaction' | 'notification' | 'sub_workflow';
  config: any;
}

export interface FormData {
  id: number;
  name: string;
  schema: {
    fields: Array<{
      id: string;
      label: string;
      type: string;
    }>;
  };
}

export interface TriggerConfig {
  type: string;
  formId?: number;
}

export interface WorkflowData {
  name: string;
  trigger_type: string;
  trigger_config: TriggerConfig;
  workflow_definition: {
    steps: WorkflowStep[];
    initial_step: string;
  };
}
