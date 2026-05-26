// src/components/workflow/StepEditor.tsx
import React, { useState } from 'react';
import styled from '@emotion/styled';
import { WorkflowStep, WorkflowStepType } from '../../types/automation.types';

import Card from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';

import Textarea from '@/components/ui/Textarea';

import { Input } from '@/components/ui/Input';

import { Select } from '@/components/ui/Select';

interface StepEditorProps {
  step: WorkflowStep;
  stepIndex: number;
  allSteps: WorkflowStep[];
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onClose: () => void;
}

const StepTypeConfigs: Record<WorkflowStepType, { description: string; configExample: any }> = {
  query: {
    description: 'Query database records',
    configExample: {
      entity: 'Account',
      where: { id: '${account_id}' },
      fields: ['name', 'balance'],
    },
  },
  condition: {
    description: 'Evaluate conditions and branch workflow',
    configExample: {
      conditions: [{ field: 'balance', operator: '>=', value: '${amount}' }],
    },
  },
  calculation: {
    description: 'Perform calculations',
    configExample: {
      expression: '${balance} - ${amount}',
      output_field: 'new_balance',
    },
  },
  transaction: {
    description: 'Execute database transactions',
    configExample: {
      operations: [{ type: 'update', entity: 'Account', data: { balance: '${new_balance}' } }],
    },
  },
  notification: {
    description: 'Send notifications',
    configExample: {
      type: 'email',
      to: '${user_email}',
      subject: 'Transaction Completed',
      template: 'transaction_success',
    },
  },
  api_call: {
    description: 'Make external API calls',
    configExample: {
      url: 'https://api.example.com/process',
      method: 'POST',
      headers: { Authorization: 'Bearer ${api_key}' },
      body: { transaction_id: '${txn_id}' },
    },
  },
  update: {
    description: 'Update records',
    configExample: {
      entity: 'Transaction',
      where: { id: '${txn_id}' },
      data: { status: 'completed' },
    },
  },
  approval: {
    description: 'Require manual approval',
    configExample: {
      required_roles: ['manager', 'supervisor'],
      timeout_hours: 24,
      message: 'Please approve this transaction',
    },
  },
};

const StepTypeOptions = [
  { value: 'query', label: 'Database Query' },
  { value: 'condition', label: 'Condition' },
  { value: 'calculation', label: 'Calculation' },
  { value: 'transaction', label: 'Transaction' },
  { value: 'notification', label: 'Notification' },
  { value: 'api_call', label: 'API Call' },
  { value: 'update', label: 'Update Record' },
  { value: 'approval', label: 'Approval' },
];

const EditorGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const SectionTitle = styled.h5`
  margin: 0;
  color: #374151;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
`;

export const StepEditor: React.FC<StepEditorProps> = ({
  step,
  stepIndex,
  allSteps,
  onUpdate,
  onClose,
}) => {
  const [configError, setConfigError] = useState<string>('');

  const handleConfigChange = (value: string) => {
    try {
      if (value.trim()) {
        const parsed = JSON.parse(value);
        onUpdate({ config: parsed });
        setConfigError('');
      } else {
        onUpdate({ config: {} });
        setConfigError('');
      }
    } catch (error: unknown) {
      setConfigError('Invalid JSON format');
      // Keep the invalid text but don't update the config
    }
  };

  const otherSteps = allSteps.filter(s => s.id !== step.id);
  const stepOptions = otherSteps.map(s => ({ value: s.id, label: `${s.name} (${s.id})` }));

  return (
    <Card title={`Edit Step: ${step.name}`} padding="md">
      <EditorGrid>
        <Section>
          <SectionTitle>Basic Information</SectionTitle>
          <Input
            label="Step Name"
            value={step.name}
            onChange={value => onUpdate({ name: value })}
            placeholder="Enter step name"
            required
          />

          <Input
            label="Step ID"
            value={step.id}
            onChange={value => onUpdate({ id: value })}
            placeholder="Enter unique step ID"
            required
            helpText="Unique identifier used for branching and references"
          />

          <Select
            label="Step Type"
            value={step.type}
            onChange={value => onUpdate({ type: value as WorkflowStepType })}
            options={StepTypeOptions}
            helpText={StepTypeConfigs[step.type].description}
          />
        </Section>

        <Section>
          <SectionTitle>Configuration</SectionTitle>
          <Textarea
            label="Step Config (JSON)"
            value={JSON.stringify(step.config || {}, null, 2)}
            onChange={handleConfigChange}
            placeholder="Enter step configuration as JSON"
            rows={6}
            error={configError}
            helpText={
              <div>
                <div>Step-specific configuration. Example:</div>
                <pre
                  style={{
                    fontSize: '0.75rem',
                    background: '#f8fafc',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    marginTop: '0.25rem',
                  }}
                >
                  {JSON.stringify(StepTypeConfigs[step.type].configExample, null, 2)}
                </pre>
              </div>
            }
          />
        </Section>

        <Section>
          <SectionTitle>Step Connections</SectionTitle>

          {step.type === 'condition' && (
            <>
              <Select
                label="On True → Go to step"
                value={step.on_true || ''}
                onChange={value => onUpdate({ on_true: value || undefined })}
                options={stepOptions}
                placeholder="Select step for true branch"
                helpText="Step to execute when condition evaluates to true"
              />

              <Select
                label="On False → Go to step"
                value={step.on_false || ''}
                onChange={value => onUpdate({ on_false: value || undefined })}
                options={stepOptions}
                placeholder="Select step for false branch"
                helpText="Step to execute when condition evaluates to false"
              />
            </>
          )}

          <Input
            label="Next Step(s)"
            value={Array.isArray(step.next) ? step.next.join(', ') : step.next || ''}
            onChange={value => {
              if (!value.trim()) {
                onUpdate({ next: undefined });
              } else {
                const steps = value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);
                onUpdate({ next: steps.length === 1 ? steps[0] : steps });
              }
            }}
            placeholder="step_id_1, step_id_2 (comma separated for multiple)"
            helpText="Next step(s) to execute. Use commas for multiple next steps."
          />

          <div>
            <label
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                display: 'block',
              }}
            >
              Quick Step Links
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {otherSteps.map(targetStep => (
                <Button
                  key={targetStep.id}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const currentNext = step.next || [];
                    const nextArray = Array.isArray(currentNext) ? [...currentNext] : [currentNext];
                    if (!nextArray.includes(targetStep.id)) {
                      onUpdate({ next: [...nextArray, targetStep.id] });
                    }
                  }}
                >
                  Link to {targetStep.name}
                </Button>
              ))}
            </div>
          </div>
        </Section>

        <ActionsRow>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </ActionsRow>
      </EditorGrid>
    </Card>
  );
};
