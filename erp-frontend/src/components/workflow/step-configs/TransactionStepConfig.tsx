import React, { useState } from 'react';
import { Variable } from '../../../types/workflow';

interface TransactionStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

const TransactionStepConfig: React.FC<TransactionStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [entries, setEntries] = useState(config.entries || []);

  const handleAddEntry = () => {
    const updated = [...entries, { account_id: '', side: 'DR', amount: '' }];
    setEntries(updated);
    onChange({ entries: updated });
  };

  const handleEntryChange = (index: number, field: string, value: any) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
    onChange({ entries: updated });
  };

  const handleRemoveEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    onChange({ entries: updated });
  };

  const accountVariables = variables.filter(
    v => v.name.toLowerCase().includes('account') || v.type === 'number'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          padding: '0.75rem',
          background: '#fff5f5',
          border: '1px solid #fecaca',
          borderRadius: '0.375rem',
          fontSize: '0.75rem',
          color: '#991b1b',
        }}
      >
        ⚠️ Transaction steps create financial records. Ensure proper validation before this step.
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
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Transaction Entries</label>
          <button
            onClick={handleAddEntry}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              background: 'white',
              cursor: 'pointer',
            }}
            type="button"
          >
            + Add Entry
          </button>
        </div>

        {entries.map((entry: any, idx: number) => (
          <div
            key={idx}
            style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              background: '#f9fafb',
              borderRadius: '0.375rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem' }}>
              <select
                value={entry.account_id}
                onChange={e => handleEntryChange(idx, 'account_id', e.target.value)}
                style={{
                  padding: '0.375rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}
                aria-label="Account"
              >
                <option value="">Account...</option>
                {accountVariables.map(v => (
                  <option key={v.id} value={v.path}>
                    {v.name}
                  </option>
                ))}
              </select>

              <select
                value={entry.side}
                onChange={e => handleEntryChange(idx, 'side', e.target.value)}
                style={{
                  padding: '0.375rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}
                aria-label="Entry side"
              >
                <option value="DR">Debit</option>
                <option value="CR">Credit</option>
              </select>

              <select
                value={entry.amount}
                onChange={e => handleEntryChange(idx, 'amount', e.target.value)}
                style={{
                  padding: '0.375rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}
                aria-label="Amount"
              >
                <option value="">Amount...</option>
                {variables
                  .filter(v => v.type === 'number')
                  .map(v => (
                    <option key={v.id} value={v.path}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={() => handleRemoveEntry(idx)}
              style={{
                marginTop: '0.5rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.625rem',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
              }}
              type="button"
              aria-label="Remove entry"
            >
              Remove Entry
            </button>
          </div>
        ))}

        {entries.length < 2 && (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '0.75rem',
              border: '1px dashed #e5e7eb',
              borderRadius: '0.375rem',
            }}
          >
            Add at least 2 entries (debit and credit)
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionStepConfig;
