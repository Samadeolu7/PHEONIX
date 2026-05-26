import React from 'react';
import { Trash2 } from 'lucide-react';
import QueryStepConfig from './step-configs/QueryStepConfig';
import ConditionStepConfig from './step-configs/ConditionStepConfig';
import CalculationStepConfig from './step-configs/CalculationStepConfig';
import TransactionStepConfig from './step-configs/TransactionStepConfig';
import NotificationStepConfig from './step-configs/NotificationStepConfig';
import SubWorkflowStepConfig from './step-configs/SubWorkflowStepConfig';
import ApprovalStepConfig from './step-configs/ApprovalStepConfig';
import {
  DataTransformStepConfig,
  HttpRequestStepConfig,
} from './step-configs/DataTransformStepConfig';
import { Variable, WorkflowStep } from '../../types/workflow';

interface StepConfigPanelProps {
  step: WorkflowStep;
  variables: Variable[];
  allSteps: WorkflowStep[];
  onChange: (updates: Partial<WorkflowStep>) => void;
  onDelete: () => void;
}

const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  step,
  variables,
  allSteps,
  onChange,
  onDelete,
}) => {
  const getStepIcon = () => {
    const icons: Record<string, string> = {
      query: '🔍',
      condition: '🔀',
      calculation: '🧮',
      transaction: '💳',
      notification: '📧',
      approval: '✅',
      sub_workflow: '🔗',
      data_transform: '⚙️',
      http_request: '🌐',
      update: '✏️',
    };
    return icons[step.type] || '📝';
  };

  const getStepColor = () => {
    const colors: Record<string, string> = {
      query: '#3b82f6',
      condition: '#f59e0b',
      calculation: '#10b981',
      transaction: '#8b5cf6',
      notification: '#f43f5e',
      approval: '#14b8a6',
      sub_workflow: '#6366f1',
      data_transform: '#06b6d4',
      http_request: '#0ea5e9',
      update: '#ec4899',
    };
    return colors[step.type] || '#6b7280';
  };

  const renderStepConfig = () => {
    switch (step.type) {
      case 'query':
        return (
          <QueryStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'condition':
        return (
          <ConditionStepConfig
            config={step.config}
            variables={variables}
            allSteps={allSteps}
            currentStepId={step.id}
            onChange={config => onChange({ config })}
          />
        );
      case 'calculation':
        return (
          <CalculationStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'transaction':
        return (
          <TransactionStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'notification':
        return (
          <NotificationStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'sub_workflow':
        return (
          <SubWorkflowStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'approval':
        return (
          <ApprovalStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'data_transform':
        return (
          <DataTransformStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      case 'http_request':
        return (
          <HttpRequestStepConfig
            config={step.config}
            variables={variables}
            onChange={config => onChange({ config })}
          />
        );
      default:
        return (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚧</div>
            <div>Configuration for {step.type} coming soon</div>
          </div>
        );
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
          <div
            style={{
              fontSize: '1.5rem',
              lineHeight: 1,
            }}
          >
            {getStepIcon()}
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.125rem', fontWeight: 600 }}>
              Configure Step
            </h3>
            <div
              style={{
                fontSize: '0.75rem',
                color: getStepColor(),
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {step.type.replace('_', ' ')}
            </div>
          </div>
        </div>
        <button
          onClick={onDelete}
          style={{
            padding: '0.5rem',
            border: 'none',
            borderRadius: '0.375rem',
            background: '#fef2f2',
            color: '#ef4444',
            cursor: 'pointer',
          }}
          aria-label="Delete step"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Step Name */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Step Name
        </label>
        <input
          value={step.name}
          onChange={e => onChange({ name: e.target.value })}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Step name"
        />
      </div>

      {/* Step-specific configuration */}
      {renderStepConfig()}
    </div>
  );
};

export default StepConfigPanel;
