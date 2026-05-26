import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Variable } from '../../../types/workflow';

interface QueryStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

const QueryStepConfig: React.FC<QueryStepConfigProps> = ({ config, variables, onChange }) => {
  const [entity, setEntity] = useState(config.entity || '');
  const [filters, setFilters] = useState(config.filters || []);

  const entities = ['Account', 'Transaction', 'Client', 'User'];

  const handleAddFilter = () => {
    const newFilters = [...filters, { field: '', operator: '==', value: '' }];
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  const handleFilterChange = (index: number, field: string, value: any) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], [field]: value };
    setFilters(updated);
    onChange({ entity, filters: updated });
  };

  const handleRemoveFilter = (index: number) => {
    const updated = filters.filter((_, i) => i !== index);
    setFilters(updated);
    onChange({ entity, filters: updated });
  };

  const handleEntityChange = (value: string) => {
    setEntity(value);
    onChange({ entity: value, filters });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Entity */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Entity to Query
        </label>
        <select
          value={entity}
          onChange={e => handleEntityChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Select entity to query"
        >
          <option value="">Select entity...</option>
          {entities.map(e => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {/* Filters */}
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
            onClick={handleAddFilter}
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

        {filters.map((filter: any, idx: number) => (
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
            <input
              value={filter.field}
              onChange={e => handleFilterChange(idx, 'field', e.target.value)}
              placeholder="field"
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Filter field"
            />
            <select
              value={filter.operator}
              onChange={e => handleFilterChange(idx, 'operator', e.target.value)}
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Filter operator"
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">≥</option>
              <option value="<">{'<'}</option>
              <option value="<=">≤</option>
            </select>
            <select
              value={filter.value}
              onChange={e => handleFilterChange(idx, 'value', e.target.value)}
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
              aria-label="Filter value"
            >
              <option value="">variable...</option>
              {variables.map(v => (
                <option key={v.id} value={v.path}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleRemoveFilter(idx)}
              style={{
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
              }}
              aria-label="Remove filter"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QueryStepConfig;
