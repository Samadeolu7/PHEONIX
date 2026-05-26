import { Variable, WorkflowStep } from '../types/workflow';

/**
 * Generate a unique ID for workflow elements
 */
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validate workflow step configuration
 */
export const validateStep = (step: WorkflowStep): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!step.name.trim()) {
    errors.push('Step name is required');
  }

  switch (step.type) {
    case 'query':
      if (!step.config.entity) {
        errors.push('Entity is required for query step');
      }
      break;
    case 'condition':
      if (!step.config.conditions || step.config.conditions.length === 0) {
        errors.push('At least one condition is required');
      }
      break;
    case 'calculation':
      if (!step.config.result_name) {
        errors.push('Result variable name is required');
      }
      if (!step.config.formula) {
        errors.push('Formula is required');
      }
      break;
    case 'transaction':
      if (!step.config.entries || step.config.entries.length < 2) {
        errors.push('At least two transaction entries are required');
      }
      break;
    case 'notification':
      if (!step.config.recipient) {
        errors.push('Recipient is required');
      }
      if (!step.config.message) {
        errors.push('Message is required');
      }
      break;
    case 'sub_workflow':
      if (!step.config.workflow_id) {
        errors.push('Sub-workflow selection is required');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate workflow before saving
 */
export const validateWorkflow = (
  name: string,
  trigger: any,
  steps: WorkflowStep[]
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!name.trim()) {
    errors.push('Workflow name is required');
  }

  if (!trigger) {
    errors.push('Trigger configuration is required');
  }

  if (steps.length === 0) {
    errors.push('At least one step is required');
  }

  // Validate each step
  steps.forEach((step, index) => {
    const stepValidation = validateStep(step);
    if (!stepValidation.valid) {
      errors.push(`Step ${index + 1} (${step.name}): ${stepValidation.errors.join(', ')}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Create default step configuration based on type
 */
export const createDefaultStepConfig = (type: string): any => {
  switch (type) {
    case 'query':
      return {
        entity: '',
        filters: [],
      };
    case 'condition':
      return {
        conditions: [],
        logic: 'AND',
        on_true: '',
        on_false: '',
      };
    case 'calculation':
      return {
        result_name: '',
        formula: '',
      };
    case 'transaction':
      return {
        entries: [],
      };
    case 'notification':
      return {
        type: 'email',
        recipient: '',
        message: '',
      };
    case 'sub_workflow':
      return {
        workflow_id: '',
      };
    default:
      return {};
  }
};

/**
 * Create a new step with default configuration
 */
export const createStep = (type: string): WorkflowStep => {
  return {
    id: generateId('step'),
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
    type: type as WorkflowStep['type'],
    config: createDefaultStepConfig(type),
  };
};

/**
 * Extract variable references from a formula
 */
export const extractVariablesFromFormula = (
  formula: string,
  availableVariables: Variable[]
): Variable[] => {
  if (!formula) return [];

  const variablePaths = availableVariables.map(v => v.path);
  return availableVariables.filter(v => formula.includes(v.path));
};

/**
 * Format variable path for display
 */
export const formatVariablePath = (path: string): string => {
  const parts = path.split('.');
  return parts[parts.length - 1].replace(/_/g, ' ');
};

/**
 * Get variable value by path from context
 */
export const getVariableValue = (path: string, context: Record<string, any>): any => {
  const parts = path.split('.');
  let value = context;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }

  return value;
};

/**
 * Create variable from form field
 */
export const createVariableFromFormField = (field: any): Variable => {
  return {
    id: generateId('var'),
    name: field.label,
    type: field.type === 'number' ? 'number' : 'string',
    source: 'form',
    path: `form.${field.id}`,
  };
};
