import React, { useState } from 'react';
import { Variable } from '../../../types/workflow';

interface CalculationStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

const CalculationStepConfig: React.FC<CalculationStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [formula, setFormula] = useState(config.formula || '');
  const [resultName, setResultName] = useState(config.result_name || '');

  const handleResultNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setResultName(value);
    onChange({ formula, result_name: value });
  };

  const handleFormulaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormula(value);
    onChange({ formula: value, result_name: resultName });
  };

  const insertVariable = (varPath: string) => {
    const newFormula = formula + (formula ? ' ' : '') + varPath;
    setFormula(newFormula);
    onChange({ formula: newFormula, result_name: resultName });
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
          value={resultName}
          onChange={handleResultNameChange}
          placeholder="e.g., total_amount"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Result variable name"
        />
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
          Formula
        </label>
        <textarea
          value={formula}
          onChange={handleFormulaChange}
          placeholder="e.g., amount * 1.1"
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
          }}
          aria-label="Formula"
        />
      </div>

      <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '0.375rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.5rem' }}>
          Available Variables:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {variables
            .filter(v => v.type === 'number')
            .map(v => (
              <button
                key={v.id}
                onClick={() => insertVariable(v.path)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.625rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  background: 'white',
                  cursor: 'pointer',
                }}
                type="button"
                aria-label={`Insert ${v.name}`}
              >
                {v.name}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};

export default CalculationStepConfig;
