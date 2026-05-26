// src/components/workflow/SecureStepEditors.tsx
// ZERO JSON EDITING - Pure Visual Components
// Variables strictly controlled by trigger type and previous steps

import React, { useState, useEffect } from 'react';
import { automationService } from '../../services/automationService';

/* ---------------------- Types ---------------------- */
interface AvailableVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array';
  source: 'form' | 'query' | 'calculation';
  path: string;
  allowed_in_trigger: ('event' | 'schedule' | 'manual')[];
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

interface EntityField {
  name: string;
  type: string;
  filterable: boolean;
  operators: string[];
}

/* ---------------------- Secure Query Step Editor ---------------------- */
export const SecureQueryStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, triggerType }) => {
  const [entity, setEntity] = useState(config.entity || '');
  const [filters, setFilters] = useState<
    Array<{
      field: string;
      operator: string;
      value: string;
      value_type: 'variable' | 'literal';
    }>
  >(config.filters || []);

  const [entities, setEntities] = useState<string[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch whitelisted entities from backend
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const response = await automationService.getWhitelistedEntities();
        setEntities(response.entities);
      } catch (error: unknown) {
        console.error('Failed to fetch entities:', error);
        setEntities([]);
      }
    };
    fetchEntities();
  }, []);

  // Fetch entity fields when entity is selected
  useEffect(() => {
    if (entity) {
      const fetchFields = async () => {
        setLoading(true);
        try {
          const response = await automationService.getEntityFields(entity);
          setFields(response.fields);
        } catch (error: unknown) {
          console.error('Failed to fetch fields:', error);
          setFields([]);
        } finally {
          setLoading(false);
        }
      };
      fetchFields();
    } else {
      setFields([]);
    }
  }, [entity]);

  // Filter variables based on trigger type and data type compatibility
  const getCompatibleVariables = (fieldType: string): AvailableVariable[] => {
    return availableVars.filter(v => {
      // Check if variable is allowed in this trigger type
      if (!v.allowed_in_trigger.includes(triggerType)) return false;

      // Check type compatibility
      if (fieldType === 'string') return ['string', 'object'].includes(v.type);
      if (fieldType === 'number') return v.type === 'number';
      if (fieldType === 'date') return v.type === 'date';
      if (fieldType === 'boolean') return v.type === 'boolean';

      return false;
    });
  };

  const addFilter = () => {
    const newFilters = [
      ...filters,
      {
        field: '',
        operator: '==',
        value: '',
        value_type: 'variable' as const,
      },
    ];
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

  const selectedField = (fieldName: string) => fields.find(f => f.name === fieldName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Entity Selection - Only from whitelisted backend entities */}
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
            setFilters([]); // Clear filters when entity changes
            onChange({ entity: e.target.value, filters: [] });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          disabled={entities.length === 0}
        >
          <option value="">
            {entities.length === 0 ? 'Loading entities...' : 'Select entity...'}
          </option>
          {entities.map(e => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {/* Filters - Only allowed fields and operators */}
      {entity && (
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
              disabled={loading || fields.length === 0}
              style={{
                fontSize: '0.875rem',
                color: '#4299e1',
                background: 'none',
                border: 'none',
                cursor: fields.length > 0 ? 'pointer' : 'not-allowed',
                padding: '0.25rem',
              }}
            >
              + Add Filter
            </button>
          </div>

          {loading && (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                color: '#718096',
                fontSize: '0.875rem',
              }}
            >
              Loading fields...
            </div>
          )}

          {!loading &&
            filters.map((filter, index) => {
              const field = selectedField(filter.field);
              const compatibleVars = field ? getCompatibleVariables(field.type) : [];

              return (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {/* Field Selection - Only filterable fields */}
                  <select
                    value={filter.field}
                    onChange={e =>
                      updateFilter(index, {
                        field: e.target.value,
                        operator: '==', // Reset operator when field changes
                        value: '', // Reset value when field changes
                      })
                    }
                    style={{
                      flex: 1,
                      padding: '0.25rem 0.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">Select field...</option>
                    {fields
                      .filter(f => f.filterable)
                      .map(f => (
                        <option key={f.name} value={f.name}>
                          {f.name} ({f.type})
                        </option>
                      ))}
                  </select>

                  {/* Operator Selection - Only allowed operators for this field */}
                  <select
                    value={filter.operator}
                    onChange={e => updateFilter(index, { operator: e.target.value })}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                    disabled={!filter.field}
                  >
                    {field?.operators.map(op => (
                      <option key={op} value={op}>
                        {op === '==' ? '=' : op}
                      </option>
                    )) || <option value="==">Select field first</option>}
                  </select>

                  {/* Value Selection - Only from compatible variables */}
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
                      padding: '0.25rem 0.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                    disabled={!filter.field || compatibleVars.length === 0}
                  >
                    <option value="">
                      {!filter.field
                        ? 'Select field first...'
                        : compatibleVars.length === 0
                          ? 'No compatible variables'
                          : 'Select variable...'}
                    </option>
                    {compatibleVars.map(v => (
                      <option key={v.path} value={v.path}>
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
              );
            })}

          {!loading && filters.length === 0 && (
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
              No filters. Click "+ Add Filter" to add one.
            </div>
          )}
        </div>
      )}

      {!entity && (
        <div
          style={{
            padding: '1.5rem',
            textAlign: 'center',
            color: '#a0aec0',
            fontSize: '0.875rem',
            border: '1px dashed #e2e8f0',
            borderRadius: '0.375rem',
          }}
        >
          Select an entity to begin configuring filters
        </div>
      )}
    </div>
  );
};

/* ---------------------- Secure Calculation Step Editor ---------------------- */
export const SecureCalculationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, triggerType }) => {
  const [formula, setFormula] = useState<string[]>(config.formula ? config.formula.split(' ') : []);
  const [resultName, setResultName] = useState(config.result_name || 'result');

  const operators = ['+', '-', '*', '/', '(', ')'];
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([]);

  // Fetch whitelisted math functions from backend
  useEffect(() => {
    const fetchFunctions = async () => {
      try {
        const response = await automationService.getWhitelistedFunctions();
        setAllowedFunctions(response.functions);
      } catch (error: unknown) {
        console.error('Failed to fetch functions:', error);
        setAllowedFunctions(['sum', 'avg', 'min', 'max', 'round']);
      }
    };
    fetchFunctions();
  }, []);

  // Filter to only numeric variables allowed in this trigger
  const numericVariables = availableVars.filter(
    v => v.type === 'number' && v.allowed_in_trigger.includes(triggerType)
  );

  const addToFormula = (item: string) => {
    const newFormula = [...formula, item];
    setFormula(newFormula);
    onChange({ formula: newFormula.join(' '), result_name: resultName });
  };

  const clearFormula = () => {
    setFormula([]);
    onChange({ formula: '', result_name: resultName });
  };

  const removeLastItem = () => {
    const newFormula = formula.slice(0, -1);
    setFormula(newFormula);
    onChange({ formula: newFormula.join(' '), result_name: resultName });
  };

  // Validate result name (alphanumeric and underscores only)
  const handleResultNameChange = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '');
    setResultName(sanitized);
    onChange({ formula: formula.join(' '), result_name: sanitized });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Result Variable Name */}
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
          onChange={e => handleResultNameChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          placeholder="calculated_amount"
          pattern="[a-zA-Z0-9_]+"
        />
        <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
          Only letters, numbers, and underscores allowed
        </div>
      </div>

      {/* Formula Builder */}
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={removeLastItem}
              disabled={formula.length === 0}
              style={{
                fontSize: '0.875rem',
                color: '#ed8936',
                background: 'none',
                border: 'none',
                cursor: formula.length > 0 ? 'pointer' : 'not-allowed',
                padding: '0.25rem',
              }}
            >
              ← Undo
            </button>
            <button
              onClick={clearFormula}
              disabled={formula.length === 0}
              style={{
                fontSize: '0.875rem',
                color: '#e53e3e',
                background: 'none',
                border: 'none',
                cursor: formula.length > 0 ? 'pointer' : 'not-allowed',
                padding: '0.25rem',
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Formula Display */}
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
            wordWrap: 'break-word',
          }}
        >
          {formula.length > 0 ? (
            formula.join(' ')
          ) : (
            <span style={{ color: '#a0aec0' }}>Click items below to build formula...</span>
          )}
        </div>

        {/* Building Blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Variables */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#718096',
                marginBottom: '0.25rem',
              }}
            >
              Available Variables (Numbers Only)
            </div>
            {numericVariables.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {numericVariables.map(v => (
                  <button
                    key={v.path}
                    onClick={() => addToFormula(v.path)}
                    style={{
                      padding: '0.375rem 0.625rem',
                      fontSize: '0.75rem',
                      background: '#ebf8ff',
                      color: '#2c5282',
                      border: '1px solid #bee3f8',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  color: '#a0aec0',
                  fontSize: '0.75rem',
                  border: '1px dashed #e2e8f0',
                  borderRadius: '0.375rem',
                }}
              >
                No numeric variables available. Add query steps first.
              </div>
            )}
          </div>

          {/* Operators */}
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
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.875rem',
                    background: '#e2e8f0',
                    color: '#2d3748',
                    border: '1px solid #cbd5e0',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    minWidth: '2.5rem',
                  }}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          {/* Whitelisted Functions */}
          {allowedFunctions.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#718096',
                  marginBottom: '0.25rem',
                }}
              >
                Allowed Functions
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {allowedFunctions.map(fn => (
                  <button
                    key={fn}
                    onClick={() => addToFormula(`${fn}(`)}
                    style={{
                      padding: '0.375rem 0.625rem',
                      fontSize: '0.75rem',
                      background: '#f0fff4',
                      color: '#22543d',
                      border: '1px solid #9ae6b4',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                    }}
                  >
                    {fn}()
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Numbers - Dropdown only, no manual input */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#718096',
                marginBottom: '0.25rem',
              }}
            >
              Numbers (Common Values)
            </div>
            <select
              onChange={e => {
                if (e.target.value) {
                  addToFormula(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
              }}
            >
              <option value="">Select a number...</option>
              {[0, 1, 2, 5, 10, 50, 100, 1000].map(num => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------------- Secure Condition Step Editor ---------------------- */
export const SecureConditionStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  allSteps: StepConfig[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, allSteps, triggerType }) => {
  const [conditions, setConditions] = useState(config.conditions || []);
  const [logic, setLogic] = useState(config.logic || 'AND');
  const [onTrue, setOnTrue] = useState(config.on_true || '');
  const [onFalse, setOnFalse] = useState(config.on_false || '');

  // Filter variables by trigger type
  const allowedVariables = availableVars.filter(v => v.allowed_in_trigger.includes(triggerType));

  const getOperatorsForType = (varType: string): string[] => {
    switch (varType) {
      case 'number':
        return ['==', '!=', '>', '>=', '<', '<='];
      case 'string':
        return ['==', '!=', 'contains', 'starts_with', 'ends_with'];
      case 'boolean':
        return ['==', '!='];
      case 'date':
        return ['==', '!=', '>', '>=', '<', '<='];
      default:
        return ['==', '!='];
    }
  };

  const getComparisonValues = (varType: string, varPath: string): AvailableVariable[] => {
    // Return variables of compatible type
    return allowedVariables.filter(v => v.type === varType && v.path !== varPath);
  };

  const addCondition = () => {
    const newConditions = [
      ...conditions,
      {
        field: '',
        operator: '==',
        compare_to: '',
        compare_type: 'variable' as const,
      },
    ];
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

  const removeCondition = (index: number) => {
    const newConditions = conditions.filter((_: any, i: number) => i !== index);
    setConditions(newConditions);
    updateConfig(newConditions, logic, onTrue, onFalse);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Logic Type */}
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
          <option value="AND">AND (all conditions must be true)</option>
          <option value="OR">OR (any condition can be true)</option>
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
            onClick={addCondition}
            disabled={allowedVariables.length === 0}
            style={{
              fontSize: '0.875rem',
              color: '#4299e1',
              background: 'none',
              border: 'none',
              cursor: allowedVariables.length > 0 ? 'pointer' : 'not-allowed',
              padding: '0.25rem',
            }}
          >
            + Add Condition
          </button>
        </div>

        {conditions.map((cond: any, index: number) => {
          const selectedVar = allowedVariables.find(v => v.path === cond.field);
          const operators = selectedVar ? getOperatorsForType(selectedVar.type) : ['=='];
          const comparisonVars = selectedVar
            ? getComparisonValues(selectedVar.type, selectedVar.path)
            : [];

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                background: '#fafafa',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* Variable Selection */}
                <select
                  value={cond.field}
                  onChange={e =>
                    updateCondition(index, {
                      field: e.target.value,
                      operator: '==',
                      compare_to: '',
                    })
                  }
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">Select variable...</option>
                  {allowedVariables.map(v => (
                    <option key={v.path} value={v.path}>
                      {v.name} ({v.type})
                    </option>
                  ))}
                </select>

                {/* Operator Selection */}
                <select
                  value={cond.operator}
                  onChange={e => updateCondition(index, { operator: e.target.value })}
                  style={{
                    padding: '0.375rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    minWidth: '100px',
                  }}
                  disabled={!cond.field}
                >
                  {operators.map(op => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>

                {/* Comparison Value */}
                <select
                  value={cond.compare_to}
                  onChange={e =>
                    updateCondition(index, {
                      compare_to: e.target.value,
                      compare_type: 'variable',
                    })
                  }
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  disabled={!cond.field || comparisonVars.length === 0}
                >
                  <option value="">
                    {!cond.field
                      ? 'Select variable first...'
                      : comparisonVars.length === 0
                        ? 'No compatible variables'
                        : 'Compare to...'}
                  </option>
                  {comparisonVars.map(v => (
                    <option key={v.path} value={v.path}>
                      {v.name}
                    </option>
                  ))}
                </select>

                {/* Remove Button */}
                <button
                  onClick={() => removeCondition(index)}
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
            </div>
          );
        })}

        {conditions.length === 0 && (
          <div
            style={{
              padding: '1.5rem',
              textAlign: 'center',
              color: '#a0aec0',
              fontSize: '0.875rem',
              border: '1px dashed #e2e8f0',
              borderRadius: '0.375rem',
            }}
          >
            No conditions. Click "+ Add Condition" to add one.
          </div>
        )}
      </div>

      {/* Branch Selection - Only to existing steps */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '2px solid #e2e8f0',
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
              border: '2px solid #9ae6b4',
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
              border: '2px solid #fc8181',
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

/* ---------------------- Secure Notification Step Editor ---------------------- */
export const SecureNotificationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, triggerType }) => {
  const [type, setType] = useState(config.type || 'email');
  const [recipient, setRecipient] = useState(config.recipient || '');
  const [subject, setSubject] = useState(config.subject || '');
  const [template, setTemplate] = useState(config.template || '');
  const [variables, setVariables] = useState<Record<string, string>>(config.variables || {});

  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; required_vars: string[] }>
  >([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Filter to only string variables for recipients (must be email/phone)
  const recipientVariables = availableVars.filter(
    v =>
      v.type === 'string' &&
      v.allowed_in_trigger.includes(triggerType) &&
      (v.name.toLowerCase().includes('email') || v.name.toLowerCase().includes('phone'))
  );

  // All allowed variables for message content
  const allowedVariables = availableVars.filter(v => v.allowed_in_trigger.includes(triggerType));

  // Fetch notification templates from backend
  useEffect(() => {
    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const response = await automationService.getNotificationTemplates(type);
        setTemplates(response.templates);
      } catch (error: unknown) {
        console.error('Failed to fetch templates:', error);
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, [type]);

  const selectedTemplate = templates.find(t => t.id === template);

  const updateConfig = (updates: Partial<typeof config>) => {
    onChange({ type, recipient, subject, template, variables, ...updates });
  };

  const setVariableValue = (varName: string, value: string) => {
    const newVariables = { ...variables, [varName]: value };
    setVariables(newVariables);
    updateConfig({ variables: newVariables });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Notification Type */}
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
            setTemplate(''); // Reset template when type changes
            updateConfig({ type: e.target.value, template: '' });
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

      {/* Recipient - Only from variables */}
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
            updateConfig({ recipient: e.target.value });
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
          {recipientVariables.map(v => (
            <option key={v.path} value={v.path}>
              {v.name} ({v.source})
            </option>
          ))}
        </select>
        {recipientVariables.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: '#e53e3e', marginTop: '0.25rem' }}>
            No recipient variables available. Ensure previous steps provide email/phone data.
          </div>
        )}
      </div>

      {/* Subject (Email only) */}
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
          <select
            value={subject}
            onChange={e => {
              setSubject(e.target.value);
              updateConfig({ subject: e.target.value });
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="">Select subject template...</option>
            <option value="WITHDRAWAL_APPROVED">Withdrawal Approved</option>
            <option value="WITHDRAWAL_REJECTED">Withdrawal Rejected</option>
            <option value="ACCOUNT_VERIFIED">Account Verified</option>
            <option value="TRANSACTION_ALERT">Transaction Alert</option>
            <option value="BALANCE_LOW">Low Balance Warning</option>
          </select>
        </div>
      )}

      {/* Template Selection - Only from backend */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Message Template
        </label>
        <select
          value={template}
          onChange={e => {
            setTemplate(e.target.value);
            setVariables({}); // Reset variables when template changes
            updateConfig({ template: e.target.value, variables: {} });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          disabled={loadingTemplates}
        >
          <option value="">
            {loadingTemplates ? 'Loading templates...' : 'Select template...'}
          </option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Template Variables - Map to available data */}
      {selectedTemplate && selectedTemplate.required_vars.length > 0 && (
        <div
          style={{
            padding: '1rem',
            background: '#f8fafc',
            borderRadius: '0.375rem',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.75rem' }}>
            Template Variables
          </div>

          {selectedTemplate.required_vars.map(varName => (
            <div key={varName} style={{ marginBottom: '0.75rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                {varName}
              </label>
              <select
                value={variables[varName] || ''}
                onChange={e => setVariableValue(varName, e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.375rem 0.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Select data source...</option>
                {allowedVariables.map(v => (
                  <option key={v.path} value={v.path}>
                    {v.name} ({v.type})
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Show which variables are missing */}
          {selectedTemplate.required_vars.some(v => !variables[v]) && (
            <div
              style={{
                padding: '0.5rem',
                background: '#fff5f5',
                border: '1px solid #feb2b2',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                color: '#c53030',
                marginTop: '0.5rem',
              }}
            >
              ⚠ Please map all required variables
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {template && (
        <div
          style={{
            padding: '1rem',
            background: '#edf2f7',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e0',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#4a5568',
              marginBottom: '0.5rem',
            }}
          >
            Preview
          </div>
          <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
            Template: <strong>{selectedTemplate?.name || template}</strong>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
            Variables will be replaced at runtime
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------------- Secure Transaction Step Editor ---------------------- */
export const SecureTransactionStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, triggerType }) => {
  const [transactionType, setTransactionType] = useState(config.transaction_type || '');
  const [accountId, setAccountId] = useState(config.account_id || '');
  const [amount, setAmount] = useState(config.amount || '');
  const [description, setDescription] = useState(config.description || '');

  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);

  // Fetch allowed transaction types from backend
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const response = await automationService.getAllowedTransactionTypes();
        setTransactionTypes(response.types);
      } catch (error: unknown) {
        console.error('Failed to fetch transaction types:', error);
        setTransactionTypes(['DEBIT', 'CREDIT', 'TRANSFER', 'FEE']);
      }
    };
    fetchTypes();
  }, []);

  const allowedVariables = availableVars.filter(v => v.allowed_in_trigger.includes(triggerType));

  const accountVariables = allowedVariables.filter(
    v =>
      v.type === 'string' &&
      (v.name.toLowerCase().includes('account') || v.name.toLowerCase().includes('id'))
  );

  const amountVariables = allowedVariables.filter(v => v.type === 'number');

  const updateConfig = () => {
    onChange({
      transaction_type: transactionType,
      account_id: accountId,
      amount: amount,
      description: description,
    });
  };

  useEffect(() => {
    updateConfig();
  }, [transactionType, accountId, amount, description]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          padding: '0.75rem',
          background: '#fff5f5',
          borderRadius: '0.375rem',
          border: '1px solid #feb2b2',
          fontSize: '0.875rem',
          color: '#c53030',
        }}
      >
        ⚠ Transaction steps require additional approval. They cannot be executed without admin
        review.
      </div>

      {/* Transaction Type */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Transaction Type
        </label>
        <select
          value={transactionType}
          onChange={e => setTransactionType(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select type...</option>
          {transactionTypes.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Account ID */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Account ID
        </label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select account variable...</option>
          {accountVariables.map(v => (
            <option key={v.path} value={v.path}>
              {v.name} ({v.source})
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Amount
        </label>
        <select
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select amount variable...</option>
          {amountVariables.map(v => (
            <option key={v.path} value={v.path}>
              {v.name} ({v.source})
            </option>
          ))}
        </select>
      </div>

      {/* Description Template */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Description Template
        </label>
        <select
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select description...</option>
          <option value="AUTOMATED_WITHDRAWAL">Automated Withdrawal</option>
          <option value="AUTOMATED_DEPOSIT">Automated Deposit</option>
          <option value="AUTOMATED_FEE">Automated Fee</option>
          <option value="AUTOMATED_REFUND">Automated Refund</option>
        </select>
      </div>
    </div>
  );
};

/* ---------------------- Secure Update Step Editor ---------------------- */
export const SecureUpdateStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  triggerType: 'event' | 'schedule' | 'manual';
}> = ({ config, onChange, availableVars, triggerType }) => {
  const [entity, setEntity] = useState(config.entity || '');
  const [recordId, setRecordId] = useState(config.record_id || '');
  const [updates, setUpdates] = useState<Array<{ field: string; value: string }>>(
    config.updates || []
  );

  const [entities, setEntities] = useState<string[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const response = await automationService.getWhitelistedEntities();
        setEntities(response.entities);
      } catch (error: unknown) {
        console.error('Failed to fetch entities:', error);
      }
    };
    fetchEntities();
  }, []);

  useEffect(() => {
    if (entity) {
      const fetchFields = async () => {
        try {
          const response = await automationService.getEntityFields(entity);
          // Only show updatable fields
          setFields(response.fields.filter((f: EntityField) => f.updatable !== false));
        } catch (error: unknown) {
          console.error('Failed to fetch fields:', error);
        }
      };
      fetchFields();
    }
  }, [entity]);

  const allowedVariables = availableVars.filter(v => v.allowed_in_trigger.includes(triggerType));

  const idVariables = allowedVariables.filter(
    v => v.type === 'string' && v.name.toLowerCase().includes('id')
  );

  const getCompatibleVariables = (fieldType: string) => {
    return allowedVariables.filter(v => {
      if (fieldType === 'string') return ['string', 'object'].includes(v.type);
      if (fieldType === 'number') return v.type === 'number';
      if (fieldType === 'boolean') return v.type === 'boolean';
      return false;
    });
  };

  const addUpdate = () => {
    const newUpdates = [...updates, { field: '', value: '' }];
    setUpdates(newUpdates);
    onChange({ entity, record_id: recordId, updates: newUpdates });
  };

  const updateField = (index: number, updates: Partial<(typeof updates)[0]>) => {
    const newUpdates = updates.map((u, i) => (i === index ? { ...u, ...updates } : u));
    setUpdates(newUpdates);
    onChange({ entity, record_id: recordId, updates: newUpdates });
  };

  const removeUpdate = (index: number) => {
    const newUpdates = updates.filter((_, i) => i !== index);
    setUpdates(newUpdates);
    onChange({ entity, record_id: recordId, updates: newUpdates });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Entity Selection */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Entity to Update
        </label>
        <select
          value={entity}
          onChange={e => {
            setEntity(e.target.value);
            setUpdates([]);
            onChange({ entity: e.target.value, record_id: recordId, updates: [] });
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

      {/* Record ID */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Record ID
        </label>
        <select
          value={recordId}
          onChange={e => {
            setRecordId(e.target.value);
            onChange({ entity, record_id: e.target.value, updates });
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          disabled={!entity}
        >
          <option value="">Select ID variable...</option>
          {idVariables.map(v => (
            <option key={v.path} value={v.path}>
              {v.name} ({v.source})
            </option>
          ))}
        </select>
      </div>

      {/* Field Updates */}
      {entity && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Field Updates</label>
            <button
              onClick={addUpdate}
              disabled={fields.length === 0}
              style={{
                fontSize: '0.875rem',
                color: '#4299e1',
                background: 'none',
                border: 'none',
                cursor: fields.length > 0 ? 'pointer' : 'not-allowed',
                padding: '0.25rem',
              }}
            >
              + Add Update
            </button>
          </div>

          {updates.map((update, index) => {
            const field = fields.find(f => f.name === update.field);
            const compatibleVars = field ? getCompatibleVariables(field.type) : [];

            return (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <select
                  value={update.field}
                  onChange={e => updateField(index, { field: e.target.value, value: '' })}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">Select field...</option>
                  {fields.map(f => (
                    <option key={f.name} value={f.name}>
                      {f.name} ({f.type})
                    </option>
                  ))}
                </select>

                <select
                  value={update.value}
                  onChange={e => updateField(index, { value: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  disabled={!update.field || compatibleVars.length === 0}
                >
                  <option value="">
                    {!update.field
                      ? 'Select field first...'
                      : compatibleVars.length === 0
                        ? 'No compatible variables'
                        : 'Select value...'}
                  </option>
                  {compatibleVars.map(v => (
                    <option key={v.path} value={v.path}>
                      {v.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => removeUpdate(index)}
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
            );
          })}

          {updates.length === 0 && (
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
              No updates configured. Click "+ Add Update" to add one.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
