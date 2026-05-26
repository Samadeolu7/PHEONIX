import React, { useState } from 'react';
import styled from '@emotion/styled';
import { DynamicForm } from './DynamicForm';
import type { CreateAutomationRunRequest } from '../../types/automation.types';
import type { WorkflowTemplate as AutomationTemplate } from '../../types/automation.types';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0 0 0.5rem 0;
`;

const Description = styled.p`
  color: var(--text-secondary-color, #718096);
  margin: 0;
`;

const InfoCard = styled.div`
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;

  &:not(:last-child) {
    border-bottom: 1px solid #e2e8f0;
  }
`;

const InfoLabel = styled.span`
  font-weight: 500;
  color: var(--text-secondary-color, #4a5568);
`;

const InfoValue = styled.span`
  color: var(--text-primary-color, #2c3e50);
`;

const Badge = styled.span<{ variant?: 'success' | 'warning' | 'info' }>`
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;

  ${props => {
    switch (props.variant) {
      case 'success':
        return `
          background-color: #c6f6d5;
          color: #22543d;
        `;
      case 'warning':
        return `
          background-color: #feebc8;
          color: #7c2d12;
        `;
      case 'info':
      default:
        return `
          background-color: #bee3f8;
          color: #2c5282;
        `;
    }
  }}
`;

const NoFormMessage = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  background: #f7fafc;
  border-radius: 8px;
  border: 2px dashed #cbd5e0;
`;

const NoFormText = styled.p`
  color: var(--text-secondary-color, #718096);
  margin-bottom: 1.5rem;
`;

const StartButton = styled.button`
  padding: 0.75rem 2rem;
  background-color: var(--primary-color, #1a73e8);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--primary-color-dark, #1557b0);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const WorkflowSteps = styled.div`
  margin-bottom: 2rem;
`;

const WorkflowTitle = styled.h3`
  font-size: 1.125rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0 0 1rem 0;
`;

const StepsList = styled.ol`
  padding-left: 1.5rem;
  margin: 0;
`;

const StepItem = styled.li`
  padding: 0.5rem 0;
  color: var(--text-secondary-color, #4a5568);

  &::marker {
    font-weight: 600;
    color: var(--primary-color, #1a73e8);
  }
`;

const ApprovalNote = styled.div`
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 1rem;
  margin-top: 1rem;
  border-radius: 4px;
`;

const ApprovalText = styled.p`
  margin: 0;
  color: #78350f;
  font-size: 0.875rem;
`;

export interface AutomationRunFormProps {
  template: AutomationTemplate;
  onSubmit: (request: CreateAutomationRunRequest) => Promise<void>;
  onCancel?: () => void;
}

export const AutomationRunForm: React.FC<AutomationRunFormProps> = ({
  template,
  onSubmit,
  onCancel,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (field: string, value: any) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user makes changes
    if (formErrors[field]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleFormSubmit = async () => {
    setIsSubmitting(true);
    setFormErrors({});
    try {
      await onSubmit({
        template_id: template.id || 0,
        context: formValues,
      });
    } catch (error: any) {
      // Handle validation errors from the API
      if (error.response?.data?.errors) {
        setFormErrors(error.response.data.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickStart = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        template_id: template.id || 0,
        context: {},
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get workflow information
  const initialStepLabel =
    typeof (template.initialStep || template.initial_step) === 'string'
      ? 'Initial Step'
      : ((template.initialStep || template.initial_step) as any)?.label || 'Initial Step';

  const finalStepLabel =
    typeof (template.finalStep || template.final_step) === 'string'
      ? 'Final Step'
      : ((template.finalStep || template.final_step) as any)?.label || 'Final Step';

  // Extract the actual schema from the nested structure
  // API returns: formSchema.schema.fields but DynamicForm expects formSchema.fields
  const actualSchema =
    (template.formSchema || template.form_schema)?.schema ||
    template.formSchema ||
    template.form_schema;

  return (
    <Container>
      <Header>
        <Title>{template.name}</Title>
        {template.description && <Description>{template.description}</Description>}
      </Header>

      <InfoCard>
        <InfoRow>
          <InfoLabel>Automation Type</InfoLabel>
          <InfoValue>
            <Badge variant="info">
              {template.requiresApproval || template.requires_approval
                ? 'Requires Approval'
                : 'Auto-Execute'}
            </Badge>
          </InfoValue>
        </InfoRow>
        <InfoRow>
          <InfoLabel>Workflow</InfoLabel>
          <InfoValue>
            {initialStepLabel} → {finalStepLabel}
          </InfoValue>
        </InfoRow>
        {(template.requiresApproval || template.requires_approval) && (
          <InfoRow>
            <InfoLabel>Approval Process</InfoLabel>
            <InfoValue>
              <Badge variant="warning">Manual Approval Required</Badge>
            </InfoValue>
          </InfoRow>
        )}
      </InfoCard>

      {(template.requiresApproval || template.requires_approval) && (
        <WorkflowSteps>
          <WorkflowTitle>Approval Workflow</WorkflowTitle>
          <StepsList>
            <StepItem>Submit the form with required information</StepItem>
            <StepItem>Request is sent to approvers for review</StepItem>
            <StepItem>Approvers can approve or reject the request</StepItem>
            <StepItem>If approved, automation proceeds to next step</StepItem>
            <StepItem>Process continues until completion</StepItem>
          </StepsList>
          <ApprovalNote>
            <ApprovalText>
              💡 <strong>Note:</strong> This automation requires approval at specific steps. You'll
              receive notifications when action is needed.
            </ApprovalText>
          </ApprovalNote>
        </WorkflowSteps>
      )}

      {actualSchema && actualSchema.fields && actualSchema.fields.length > 0 ? (
        <DynamicForm
          schema={actualSchema}
          values={formValues}
          errors={formErrors}
          onChange={handleFieldChange}
          onSubmit={handleFormSubmit}
          onCancel={onCancel}
          submitLabel="Start Automation"
          isSubmitting={isSubmitting}
        />
      ) : (
        <NoFormMessage>
          <NoFormText>
            This automation doesn't require any input parameters. Click the button below to start
            the automation.
          </NoFormText>
          <StartButton onClick={handleQuickStart} disabled={isSubmitting}>
            {isSubmitting ? 'Starting...' : 'Start Automation'}
          </StartButton>
        </NoFormMessage>
      )}
    </Container>
  );
};
