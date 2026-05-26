// components/workflow/HierarchicalAccountQueryEditor.tsx

import React, { useState, useEffect } from 'react';
import { automationService } from '../../services/automationService';

interface AccountHierarchy {
  id: number;
  code: string;
  name: string;
  account_type: string;
  balance: string;
  children_count: number;
  children?: ChildAccount[];
}

interface ChildAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
  balance: string;
  parent_code: string;
  hierarchy_path: string;
}

interface Props {
  config: any;
  onChange: (config: any) => void;
  availableVars: Array<{
    name: string;
    type: string;
    source: string;
    path: string;
    allowed_in_trigger: string[];
  }>;
  triggerType: 'event' | 'schedule' | 'manual';
}

export const HierarchicalAccountQueryEditor: React.FC<Props> = ({
  config,
  onChange,
  availableVars,
  triggerType,
}) => {
  const [parents, setParents] = useState<AccountHierarchy[]>([]);
  const [selectedParent, setSelectedParent] = useState<string>(config.parent_code || '');
  const [children, setChildren] = useState<ChildAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [filterMode, setFilterMode] = useState<'parent' | 'child' | 'both'>(
    config.filter_mode || 'both'
  );
  const [filters, setFilters] = useState(config.filters || []);

  // Fetch parent accounts on mount
  useEffect(() => {
    fetchParentAccounts();
  }, []);

  // Fetch children when parent is selected
  useEffect(() => {
    if (selectedParent) {
      fetchChildAccounts(selectedParent);
    }
  }, [selectedParent]);

  const fetchParentAccounts = async () => {
    setLoading(true);
    try {
      const response = await automationService.getAccountHierarchy({
        parent_only: true,
      });
      setParents(response.parents || []);
    } catch (error: unknown) {
      console.error('Failed to fetch parent accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChildAccounts = async (parentCode: string) => {
    setLoading(true);
    try {
      const response = await automationService.getAccountHierarchy({
        parent_code: parentCode,
      });
      setChildren(response.children || []);
    } catch (error: unknown) {
      console.error('Failed to fetch child accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleParentExpansion = (parentCode: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentCode)) {
      newExpanded.delete(parentCode);
    } else {
      newExpanded.add(parentCode);
      fetchChildAccounts(parentCode);
    }
    setExpandedParents(newExpanded);
  };

  const handleParentSelect = (parentCode: string) => {
    setSelectedParent(parentCode);
    onChange({
      ...config,
      entity: 'Account',
      parent_code: parentCode,
      filter_mode: filterMode,
      filters: [],
    });
    setFilters([]);
  };

  const handleFilterModeChange = (mode: 'parent' | 'child' | 'both') => {
    setFilterMode(mode);
    onChange({
      ...config,
      filter_mode: mode,
    });
  };

  const addFilter = () => {
    const newFilters = [
      ...filters,
      {
        field: '',
        operator: '==',
        value: '',
        value_type: 'variable',
      },
    ];
    setFilters(newFilters);
    onChange({ ...config, filters: newFilters });
  };

  const updateFilter = (index: number, updates: any) => {
    const newFilters = filters.map((f: any, i: number) => (i === index ? { ...f, ...updates } : f));
    setFilters(newFilters);
    onChange({ ...config, filters: newFilters });
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_: any, i: number) => i !== index);
    setFilters(newFilters);
    onChange({ ...config, filters: newFilters });
  };

  const getCompatibleVariables = (fieldType: string) => {
    return availableVars.filter(v => {
      if (!v.allowed_in_trigger.includes(triggerType)) return false;

      if (fieldType === 'string') return ['string', 'object'].includes(v.type);
      if (fieldType === 'number') return v.type === 'number';
      if (fieldType === 'date') return v.type === 'date';
      if (fieldType === 'boolean') return v.type === 'boolean';

      return false;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div
        style={{
          padding: '0.75rem',
          background: '#f8fafc',
          borderRadius: '0.375rem',
          border: '1px solid #e2e8f0',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.875rem', color: '#2d3748' }}>
          📁 Account Hierarchy Query
        </h4>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#718096' }}>
          Select a parent account (General Ledger) to query its children
        </p>
      </div>

      {/* Filter Mode Selection */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Query Scope
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { value: 'parent', label: 'Parent Only', icon: '📁' },
            { value: 'child', label: 'Children Only', icon: '📄' },
            { value: 'both', label: 'Both', icon: '🔀' },
          ].map(mode => (
            <button
              key={mode.value}
              onClick={() => handleFilterModeChange(mode.value as any)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: `2px solid ${filterMode === mode.value ? '#4299e1' : '#e2e8f0'}`,
                borderRadius: '0.375rem',
                background: filterMode === mode.value ? '#ebf8ff' : 'white',
                color: filterMode === mode.value ? '#2c5282' : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: filterMode === mode.value ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Parent Account Selection */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Select Parent Account (General Ledger)
        </label>

        {loading && parents.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#718096',
              fontSize: '0.875rem',
            }}
          >
            Loading accounts...
          </div>
        ) : (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '0.375rem',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {parents.map(parent => (
              <div key={parent.code}>
                {/* Parent Row */}
                <div
                  onClick={() => handleParentSelect(parent.code)}
                  style={{
                    padding: '0.75rem',
                    background: selectedParent === parent.code ? '#ebf8ff' : 'white',
                    borderBottom: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (selectedParent !== parent.code) {
                      e.currentTarget.style.background = '#f7fafc';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedParent !== parent.code) {
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#2d3748',
                        marginBottom: '0.25rem',
                      }}
                    >
                      📁 {parent.code} - {parent.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#718096',
                        display: 'flex',
                        gap: '1rem',
                      }}
                    >
                      <span>{parent.account_type}</span>
                      <span>•</span>
                      <span>{parent.children_count} children</span>
                      <span>•</span>
                      <span>₦{parseFloat(parent.balance).toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedParent === parent.code && (
                    <div
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: '#4299e1',
                        color: 'white',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Selected
                    </div>
                  )}
                </div>

                {/* Show children if selected and filter mode includes children */}
                {selectedParent === parent.code &&
                  (filterMode === 'child' || filterMode === 'both') &&
                  children.length > 0 && (
                    <div
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#4a5568',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        Child Accounts ({children.length})
                      </div>
                      {children.map(child => (
                        <div
                          key={child.code}
                          style={{
                            padding: '0.5rem 1rem 0.5rem 2rem',
                            fontSize: '0.8125rem',
                            color: '#4a5568',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                            📄 {child.code} - {child.name}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#718096',
                              display: 'flex',
                              gap: '1rem',
                            }}
                          >
                            <span>₦{parseFloat(child.balance).toLocaleString()}</span>
                            <span>•</span>
                            <span>{child.hierarchy_path}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Additional Filters */}
      {selectedParent && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Additional Filters</label>
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

          {filters.length === 0 ? (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                color: '#a0aec0',
                fontSize: '0.875rem',
                border: '1px dashed #e2e8f0',
                borderRadius: '0.375rem',
              }}
            >
              No additional filters. Will return all accounts from selected scope.
            </div>
          ) : (
            filters.map((filter: any, index: number) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <select
                  value={filter.field}
                  onChange={e =>
                    updateFilter(index, {
                      field: e.target.value,
                      operator: '==',
                      value: '',
                    })
                  }
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">Select field...</option>
                  <option value="balance">Balance</option>
                  <option value="account_type">Account Type</option>
                  <option value="name">Name</option>
                  <option value="code">Code</option>
                </select>

                <select
                  value={filter.operator}
                  onChange={e => updateFilter(index, { operator: e.target.value })}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  disabled={!filter.field}
                >
                  <option value="==">=</option>
                  <option value="!=">≠</option>
                  <option value=">">{'>'}</option>
                  <option value=">=">{'>='}</option>
                  <option value="<">{'<'}</option>
                  <option value="<=">{'<='}</option>
                  <option value="contains">Contains</option>
                </select>

                <select
                  value={filter.value}
                  onChange={e =>
                    updateFilter(index, {
                      value: e.target.value,
                      value_type: 'variable',
                    })
                  }
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  disabled={!filter.field}
                >
                  <option value="">Select variable...</option>
                  {getCompatibleVariables(filter.field === 'balance' ? 'number' : 'string').map(
                    v => (
                      <option key={v.path} value={v.path}>
                        {v.name} ({v.source})
                      </option>
                    )
                  )}
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
            ))
          )}
        </div>
      )}

      {/* Query Summary */}
      {selectedParent && (
        <div
          style={{
            padding: '0.75rem',
            background: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            color: '#2c5282',
          }}
        >
          <strong>Query Summary:</strong>
          <div style={{ marginTop: '0.25rem' }}>
            Will query{' '}
            {filterMode === 'parent'
              ? 'parent account'
              : filterMode === 'child'
                ? 'child accounts'
                : 'parent and child accounts'}{' '}
            <strong>{selectedParent}</strong>
            {filters.length > 0 && ` with ${filters.length} additional filter(s)`}
          </div>
        </div>
      )}
    </div>
  );
};
