import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Variable, WorkflowStep } from '../../../types/workflow';

interface ConditionStepConfigProps {
  config: any;
  variables: Variable[];
  allSteps: WorkflowStep[];
  currentStepId: string;
  onChange: (config: any) => void;
}

const ConditionStepConfig: React.FC<ConditionStepConfigProps> = ({
  config,
  variables,
  allSteps,
  currentStepId,
  onChange,
}) => {
  const [conditions, setConditions] = useState(config.conditions || []);
  const [logic, setLogic] = useState(config.logic || 'AND');
  const [onTrue, setOnTrue] = useState(config.on_true || '');
  const [onFalse, setOnFalse] = useState(config.on_false || '');

  const otherSteps = allSteps.filter(s => s.id !== currentStepId);

  const handleAddCondition = () => {
    const updated = [...conditions, { field: '', operator: '==', value: '' }];
    setConditions(updated);
    onChange({ conditions: updated, logic, on_true: onTrue, on_false: onFalse });
  };

  const handleConditionChange = (index: number, field: string, value: any) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
    onChange({ conditions: updated, logic, on_true: onTrue, on_false: onFalse });
  };

  const handleRemoveCondition = (index: number) => {
    const updated = conditions.filter((_, i) => i !== index);
    setConditions(updated);
    onChange({ conditions: updated, logic, on_true: onTrue, on_false: onFalse });
  };

  const handleLogicChange = (value: string) => {
    setLogic(value);
    onChange({ conditions, logic: value, on_true: onTrue, on_false: onFalse });
  };

  const handleOnTrueChange = (value: string) => {
    setOnTrue(value);
    onChange({ conditions, logic, on_true: value, on_false: onFalse });
  };

  const handleOnFalseChange = (value: string) => {
    setOnFalse(value);
    onChange({ conditions, logic, on_true: onTrue, on_false: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Logic */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Logic
        </label>
        <select
          value={logic}
          onChange={e => handleLogicChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Condition logic"
        >
          <option value="AND">AND (all must be true)</option>
          <option value="OR">OR (any can be true)</option>
        </select>
      </div>

      {/* Conditions */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Conditions</label>
          <button
            onClick={handleAddCondition}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        {conditions.map((cond: any, idx: number) => (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr auto',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              padding: '0.5rem',
              background: '#f9fafb',
              borderRadius: '0.375rem',
            }}
          >
            <select
              value={cond.field}
              onChange={e => handleConditionChange(idx, 'field', e.target.value)}
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Condition field"
            >
              <option value="">variable...</option>
              {variables.map(v => (
                <option key={v.id} value={v.path}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={cond.operator}
              onChange={e => handleConditionChange(idx, 'operator', e.target.value)}
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Condition operator"
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">≥</option>
              <option value="<">{'<'}</option>
              <option value="<=">≤</option>
            </select>
            <input
              value={cond.value}
              onChange={e => handleConditionChange(idx, 'value', e.target.value)}
              placeholder="value"
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Condition value"
            />
            <button
              onClick={() => handleRemoveCondition(idx)}
              style={{
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
              }}
              aria-label="Remove condition"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Branch Selection */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#10b981',
            }}
          >
            If TRUE →
          </label>
          <select
            value={onTrue}
            onChange={e => handleOnTrueChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.375rem',
              border: '1px solid #10b981',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
            }}
            aria-label="On true branch"
          >
            <option value="">Select...</option>
            {otherSteps.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#ef4444',
            }}
          >
            If FALSE →
          </label>
          <select
            value={onFalse}
            onChange={e => handleOnFalseChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.375rem',
              border: '1px solid #ef4444',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
            }}
            aria-label="On false branch"
          >
            <option value="">Select...</option>
            {otherSteps.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default ConditionStepConfig;
