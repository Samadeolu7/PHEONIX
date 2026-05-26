import { WorkflowTemplate } from '@/types/automation.types';
import { automationService } from './automationService';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class WorkflowValidator {
  async validateWorkflow(workflow: WorkflowTemplate): Promise<ValidationResult> {
    const errors: string[] = [];

    // 1. Validate structure
    if (!workflow.name || workflow.name.length < 3) {
      errors.push('Workflow name must be at least 3 characters');
    }

    // 2. Validate steps exist
    const stepIds = workflow.workflow_definition.steps.map(s => s.id);
    if (stepIds.length === 0) {
      errors.push('At least one step is required');
    }

    // 3. Validate step references
    workflow.workflow_definition.steps.forEach(step => {
      if (step.next && !stepIds.includes(step.next)) {
        errors.push(`Step "${step.name}" references non-existent step: ${step.next}`);
      }
      if (step.on_true && !stepIds.includes(step.on_true)) {
        errors.push(`Step "${step.name}" references non-existent on_true: ${step.on_true}`);
      }
      if (step.on_false && !stepIds.includes(step.on_false)) {
        errors.push(`Step "${step.name}" references non-existent on_false: ${step.on_false}`);
      }
    });

    // 4. Validate trigger configuration
    if (workflow.trigger_type === 'event' && !workflow.trigger_config.event_name) {
      errors.push('Event trigger requires event_name');
    }
    if (workflow.trigger_type === 'schedule' && !workflow.trigger_config.cron) {
      errors.push('Schedule trigger requires cron expression');
    }

    // 5. Server-side validation (no DB touch)
    const serverValidation = await this.validateOnServer(workflow);
    errors.push(...serverValidation.errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings: serverValidation.warnings,
    };
  }

  private async validateOnServer(workflow: WorkflowTemplate) {
    // POST to /api/automations/workflows/validate/
    // Backend checks:
    // - Entities are whitelisted
    // - Fields exist and are accessible
    // - Variables are properly scoped
    // - No SQL injection patterns
    // - No circular references
    return await automationService.validateWorkflow(workflow);
  }
}
