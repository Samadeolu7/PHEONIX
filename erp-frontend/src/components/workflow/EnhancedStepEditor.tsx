// src/components/workflow/EnhancedStepEditors.tsx
// Import these components into your VisualWorkflowBuilder

import React, { useState, useEffect } from 'react';

/* ---------------------- Types ---------------------- */
interface AvailableVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'object';
  source: 'form' | 'query' | 'calculation';
  path: string;
}

interface StepConfig {
  id: string;
  name: string;
  type: string;
  config: any;
  next?: string;
  on_true?: string;
  on_false?: string;
}

/* ---------------------- Query Step Editor ---------------------- */
export const QueryStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [entity, setEntity] = useState(config.entity || '');
  const [filters, setFilters] = useState<Array<{ field: string; operator: string; value: string }>>(
    config.filters || []
  );

  const entities = ['Account', 'Transaction', 'User', 'Loan', 'Deposit'];
  const [fields, setFields] = useState<string[]>([]);

  // Load available fields for selected entity
  useEffect(() => {
    if (entity) {
      // In production, fetch from backend: /api/automations/entities/${entity}/fields/
      // For now, provide common fields
      const commonFields: Record<string, string[]> = {
        Account: ['id', 'account_number', 'balance', 'status', 'user_id', 'created_at'],
        Transaction: ['id', 'amount', 'type', 'status', 'account_id', 'timestamp'],
        User: ['id', 'email', 'name', 'role', 'status', 'created_at'],
        Loan: ['id', 'amount', 'interest_rate', 'status', 'account_id', 'due_date'],
        Deposit: ['id', 'amount', 'status', 'account_id', 'timestamp'],
      };
      setFields(commonFields[entity] || ['id', 'name', 'status']);
    }
  }, [entity]);

  const addFilter = () => {
    const newFilters = [...filters, { field: '', operator: '==', value: '' }];
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  const updateFilter = (index: number, updates: Partial<(typeof filters)[0]>) => {
    const newFilters = filters.map((f, i) => (i === index ? { ...f, ...updates } : f));
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Query Entity
        </label>
        <select
          value={entity}
          onChange={e => {
            setEntity(e.target.value);
            onChange({ entity: e.target.value, filters });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select entity...</option>
          {entities.map(e => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Filters</label>
          <button
            onClick={addFilter}
            style={{
              fontSize: '0.875rem',
              color: '#4299e1',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            + Add Filter
          </button>
        </div>

        {filters.map((filter, index) => (
          <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select
              value={filter.field}
              onChange={e => updateFilter(index, { field: e.target.value })}
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Field...</option>
              {fields.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <select
              value={filter.operator}
              onChange={e => updateFilter(index, { operator: e.target.value })}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">{'>='}</option>
              <option value="<">{'<'}</option>
              <option value="<=">{'<='}</option>
            </select>

            <select
              value={filter.value}
              onChange={e => updateFilter(index, { value: e.target.value })}
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Value...</option>
              {availableVars.map(v => (
                <option key={v.path} value={`\${${v.path}}`}>
                  {v.name} ({v.source})
                </option>
              ))}
            </select>

            <button
              onClick={() => removeFilter(index)}
              style={{
                color: '#e53e3e',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.25rem',
                padding: '0 0.5rem',
              }}
            >
              ×
            </button>
          </div>
        ))}

        {filters.length === 0 && (
          <div
            style={{ padding: '1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.875rem' }}
          >
            No filters. Click "+ Add Filter" to add one.
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------- Calculation Step Editor ---------------------- */
export const CalculationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [formula, setFormula] = useState<string[]>(config.formula ? config.formula.split(' ') : []);
  const [resultName, setResultName] = useState(config.result_name || 'result');

  const operators = ['+', '-', '*', '/', '(', ')'];

  const addToFormula = (item: string) => {
    const newFormula = [...formula, item];
    setFormula(newFormula);
    onChange({ formula: newFormula.join(' '), result_name: resultName });
  };

  const clearFormula = () => {
    setFormula([]);
    onChange({ formula: '', result_name: resultName });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Result Variable Name
        </label>
        <input
          type="text"
          value={resultName}
          onChange={e => {
            setResultName(e.target.value);
            onChange({ formula: formula.join(' '), result_name: e.target.value });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          placeholder="e.g., calculated_amount"
        />
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Formula Builder</label>
          <button
            onClick={clearFormula}
            style={{
              fontSize: '0.875rem',
              color: '#e53e3e',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            Clear
          </button>
        </div>

        <div
          style={{
            padding: '0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            background: '#f8fafc',
            marginBottom: '0.75rem',
            minHeight: '60px',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
          }}
        >
          {formula.join(' ') || 'Click items below to build formula...'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#718096',
                marginBottom: '0.25rem',
              }}
            >
              Available Variables
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {availableVars
                .filter(v => v.type === 'number')
                .map(v => (
                  <button
                    key={v.path}
                    onClick={() => addToFormula(v.path)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      background: '#ebf8ff',
                      color: '#2c5282',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                    }}
                  >
                    {v.name}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#718096',
                marginBottom: '0.25rem',
              }}
            >
              Operators
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {operators.map(op => (
                <button
                  key={op}
                  onClick={() => addToFormula(op)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.875rem',
                    background: '#e2e8f0',
                    color: '#2d3748',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#718096',
                marginBottom: '0.25rem',
              }}
            >
              Numbers
            </div>
            <input
              type="number"
              placeholder="Enter number and press Enter"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  addToFormula((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
              style={{
                width: '100%',
                padding: '0.25rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------------- Condition Step Editor ---------------------- */
export const ConditionStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  allSteps: StepConfig[];
}> = ({ config, onChange, availableVars, allSteps }) => {
  const [conditions, setConditions] = useState(config.conditions || []);
  const [logic, setLogic] = useState(config.logic || 'AND');
  const [onTrue, setOnTrue] = useState(config.on_true || '');
  const [onFalse, setOnFalse] = useState(config.on_false || '');

  const addCondition = () => {
    const newConditions = [...conditions, { field: '', operator: '==', value: '' }];
    setConditions(newConditions);
    updateConfig(newConditions, logic, onTrue, onFalse);
  };

  const updateCondition = (index: number, updates: any) => {
    const newConditions = conditions.map((c: any, i: number) =>
      i === index ? { ...c, ...updates } : c
    );
    setConditions(newConditions);
    updateConfig(newConditions, logic, onTrue, onFalse);
  };

  const updateConfig = (conds: any[], log: string, trueStep: string, falseStep: string) => {
    onChange({
      conditions: conds,
      logic: log,
      on_true: trueStep,
      on_false: falseStep,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          onChange={e => {
            setLogic(e.target.value);
            updateConfig(conditions, e.target.value, onTrue, onFalse);
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="AND">AND (all must be true)</option>
          <option value="OR">OR (any must be true)</option>
        </select>
      </div>

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
            onClick={addCondition}
            style={{
              fontSize: '0.875rem',
              color: '#4299e1',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            + Add Condition
          </button>
        </div>

        {conditions.map((cond: any, index: number) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              padding: '0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.375rem',
            }}
          >
            <select
              value={cond.field}
              onChange={e => updateCondition(index, { field: e.target.value })}
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Select variable...</option>
              {availableVars.map(v => (
                <option key={v.path} value={v.path}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>

            <select
              value={cond.operator}
              onChange={e => updateCondition(index, { operator: e.target.value })}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">{'>='}</option>
              <option value="<">{'<'}</option>
              <option value="<=">{'<='}</option>
            </select>

            <input
              type="text"
              value={cond.value}
              onChange={e => updateCondition(index, { value: e.target.value })}
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
              placeholder="Value"
            />

            <button
              onClick={() => {
                const newConditions = conditions.filter((_: any, i: number) => i !== index);
                setConditions(newConditions);
                updateConfig(newConditions, logic, onTrue, onFalse);
              }}
              style={{
                color: '#e53e3e',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.25rem',
                padding: '0 0.5rem',
              }}
            >
              ×
            </button>
          </div>
        ))}

        {conditions.length === 0 && (
          <div
            style={{ padding: '1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.875rem' }}
          >
            No conditions. Click "+ Add Condition" to add one.
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#38a169',
              marginBottom: '0.5rem',
            }}
          >
            If TRUE, go to:
          </label>
          <select
            value={onTrue}
            onChange={e => {
              setOnTrue(e.target.value);
              updateConfig(conditions, logic, e.target.value, onFalse);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #9ae6b4',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="">Select step...</option>
            {allSteps.map(s => (
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
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#e53e3e',
              marginBottom: '0.5rem',
            }}
          >
            If FALSE, go to:
          </label>
          <select
            value={onFalse}
            onChange={e => {
              setOnFalse(e.target.value);
              updateConfig(conditions, logic, onTrue, e.target.value);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #fc8181',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="">Select step...</option>
            {allSteps.map(s => (
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

/* ---------------------- Notification Step Editor ---------------------- */
export const NotificationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [type, setType] = useState(config.type || 'email');
  const [recipient, setRecipient] = useState(config.recipient || '');
  const [subject, setSubject] = useState(config.subject || '');
  const [message, setMessage] = useState(config.message || '');

  const insertVariable = (varPath: string) => {
    setMessage(prev => prev + ` \${${varPath}} `);
    onChange({ type, recipient, subject, message: message + ` \${${varPath}} ` });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Notification Type
        </label>
        <select
          value={type}
          onChange={e => {
            setType(e.target.value);
            onChange({ type: e.target.value, recipient, subject, message });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="in_app">In-App Notification</option>
        </select>
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Recipient
        </label>
        <select
          value={recipient}
          onChange={e => {
            setRecipient(e.target.value);
            onChange({ type, recipient: e.target.value, subject, message });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select recipient...</option>
          {availableVars
            .filter(v => v.type === 'string')
            .map(v => (
              <option key={v.path} value={`\${${v.path}}`}>
                {v.name}
              </option>
            ))}
        </select>
      </div>

      {type === 'email' && (
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => {
              setSubject(e.target.value);
              onChange({ type, recipient, subject: e.target.value, message });
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
            placeholder="Email subject"
          />
        </div>
      )}

      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Message
        </label>
        <textarea
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            onChange({ type, recipient, subject, message: e.target.value });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
          }}
          rows={5}
          placeholder="Type your message here..."
        />

        <div style={{ marginTop: '0.5rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#718096',
              marginBottom: '0.25rem',
            }}
          >
            Insert Variables:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {availableVars.map(v => (
              <button
                key={v.path}
                onClick={() => insertVariable(v.path)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  background: '#f7fafc',
                  color: '#2d3748',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                }}
              >
                + {v.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
