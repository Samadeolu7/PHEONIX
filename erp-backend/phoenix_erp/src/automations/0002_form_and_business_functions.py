// backend/workflows/views.py (Django REST Framework views)
// API endpoints for sub-workflows and system workflows




// src/services/automationService.ts (TypeScript frontend service)
// Updated automation service with sub-workflow support


class AutomationService {
  private baseURL = '/api/automations';

  // Existing methods...

  /**
   * Get workflows that can be called by other workflows
   */

export const automationService = new AutomationService();


// Example usage in VisualWorkflowBuilder.tsx

import React, { useState, useEffect } from 'react';
import { automationService, WorkflowSummary } from '../../services/automationService';
import {
  SubWorkflowStepEditor,
  TerminalConditionStepEditor,
  TerminalApprovalStepEditor,
} from '../../components/workflow/SubWorkflowComponents';

const VisualWorkflowBuilder: React.FC = () => {
  const [callableWorkflows, setCallableWorkflows] = useState<WorkflowSummary[]>([]);
  const [complexityValidation, setComplexityValidation] = useState<any>(null);

  // Fetch callable workflows on mount
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const result = await automationService.getCallableWorkflows();
        setCallableWorkflows(result.workflows);
      } catch (error) {
        console.error('Failed to fetch callable workflows:', error);
      }
    };
    fetchWorkflows();
  }, []);

  // Validate complexity when steps change
  useEffect(() => {
    const validateComplexity = async () => {
      if (steps.length > 0) {
        try {
          const result = await automationService.validateComplexity(
            { steps, initial_step: initialStepId },
            form.workflow_type || 'standard'
          );
          setComplexityValidation(result);
        } catch (error) {
          console.error('Failed to validate complexity:', error);
        }
      }
    };

    // Debounce validation
    const timer = setTimeout(validateComplexity, 500);
    return () => clearTimeout(timer);
  }, [steps, initialStepId, form.workflow_type]);

  // Render step editor based on type
  const renderStepEditor = (step: WorkflowStep) => {
    switch (step.type) {
      case 'sub_workflow':
        return (
          <SubWorkflowStepEditor
            config={step.config}
            onChange={config => updateStep(selectedStepIndex!, { config })}
            availableVars={availableVariables}
            triggerType={form.trigger_type}
          />
        );
      
      case 'terminal_condition':
        return (
          <TerminalConditionStepEditor
            config={step.config}
            onChange={config => updateStep(selectedStepIndex!, { config })}
            availableVars={availableVariables}
            triggerType={form.trigger_type}
            allWorkflows={callableWorkflows}
          />
        );
      
      case 'approval':
        return (
          <TerminalApprovalStepEditor
            config={step.config}
            onChange={config => updateStep(selectedStepIndex!, { config })}
            availableVars={availableVariables}
            triggerType={form.trigger_type}
            allWorkflows={callableWorkflows}
          />
        );
      
      default:
        return <div>Unknown step type</div>;
    }
  };

  // Show complexity warnings
  return (
    <div>
      {/* Complexity Indicator */}
      {complexityValidation && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
            <div>
              Steps: {complexityValidation.complexity.steps}/
              {form.workflow_type === 'system' ? 10 : 15}
            </div>
            <div>
              Depth: {complexityValidation.complexity.max_depth}/
              {form.workflow_type === 'system' ? 2 : 3}
            </div>
            <div>
              Branches: {complexityValidation.complexity.branches}/
              {form.workflow_type === 'system' ? 3 : 5}
            </div>
          </div>
          
          {complexityValidation.warnings.length > 0 && (
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '0.5rem', 
              background: '#fef5e7', 
              border: '1px solid #f9e79f',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}>
              ⚠️ {complexityValidation.warnings.join(', ')}
            </div>
          )}
          
          {complexityValidation.errors.length > 0 && (
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '0.5rem', 
              background: '#fff5f5', 
              border: '1px solid #feb2b2',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              color: '#c53030'
            }}>
              ❌ {complexityValidation.errors.join(', ')}
            </div>
          )}
        </div>
      )}
      
      {/* Rest of your workflow builder UI */}
    </div>
  );
};