import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader, CheckCircle } from 'lucide-react';

interface SubWorkflowStepConfigProps {
  config: any;
  variables: any[];
  onChange: (config: any) => void;
}

interface Workflow {
  id: number;
  name: string;
  code: string;
  description?: string;
  required_inputs: string[];
  outputs: string[];
}

const SubWorkflowStepConfig: React.FC<SubWorkflowStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    // Load selected workflow details if config has workflow_id
    if (config.workflow_id && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === Number(config.workflow_id));
      setSelectedWorkflow(workflow || null);
    }
  }, [config.workflow_id, workflows]);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automations/workflows/callable/');
      if (!response.ok) throw new Error('Failed to fetch workflows');
      const data = await response.json();
      setWorkflows(data.workflows || []);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load workflows';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workflowId = Number(e.target.value);
    const workflow = workflows.find(w => w.id === workflowId);
    setSelectedWorkflow(workflow || null);
    onChange({ workflow_id: workflowId || '' });
  };

  const getAvailableVariables = () => {
    // Return variables that match workflow's required inputs
    if (!selectedWorkflow) return [];

    return variables.filter(v => {
      // Check if variable name/path matches any required input
      return selectedWorkflow.required_inputs.some(
        input => v.path.includes(input) || v.name.toLowerCase().includes(input.toLowerCase())
      );
    });
  };

  const getMissingInputs = () => {
    if (!selectedWorkflow) return [];

    const availableVars = getAvailableVariables();
    const availablePaths = new Set(availableVars.map(v => v.path));

    return selectedWorkflow.required_inputs.filter(input => {
      return !Array.from(availablePaths).some(
        path => path.includes(input) || input.includes(path.split('.').pop() || '')
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Workflow Selection */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Select Sub-Workflow
        </label>
        {loading ? (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading workflows...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        ) : (
          <select
            value={selectedWorkflow?.id || ''}
            onChange={handleWorkflowChange}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
            aria-label="Select sub-workflow"
          >
            <option value="">Select sub-workflow...</option>
            {workflows.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} {w.code ? `(${w.code})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Workflow Details */}
      {selectedWorkflow && (
        <>
          {/* Description */}
          {selectedWorkflow.description && (
            <div
              style={{
                padding: '0.75rem',
                background: '#f9fafb',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                color: '#6b7280',
              }}
            >
              {selectedWorkflow.description}
            </div>
          )}

          {/* Required Inputs */}
          <div>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              Required Inputs
            </div>

            {selectedWorkflow.required_inputs.length === 0 ? (
              <div
                style={{
                  padding: '0.75rem',
                  background: '#d1fae5',
                  border: '1px solid #10b981',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  color: '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle size={14} />
                No inputs required
              </div>
            ) : (
              <div
                style={{
                  padding: '0.75rem',
                  background: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                {selectedWorkflow.required_inputs.map((input, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0',
                      borderBottom:
                        idx < selectedWorkflow.required_inputs.length - 1
                          ? '1px solid #e5e7eb'
                          : 'none',
                    }}
                  >
                    <span
                      style={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}
                    >
                      {input}
                    </span>
                    {getAvailableVariables().some(v => v.path.includes(input)) ? (
                      <span
                        style={{
                          fontSize: '0.625rem',
                          color: '#10b981',
                          background: '#d1fae5',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Available
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.625rem',
                          color: '#ef4444',
                          background: '#fef2f2',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          fontWeight: 600,
                        }}
                      >
                        ⚠ Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning if missing inputs */}
          {getMissingInputs().length > 0 && (
            <div
              style={{
                padding: '0.75rem',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                color: '#9a3412',
                display: 'flex',
                alignItems: 'start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  Missing Required Inputs
                </div>
                <div>
                  The following inputs are required but not available in current context:{' '}
                  <strong>{getMissingInputs().join(', ')}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Outputs */}
          {selectedWorkflow.outputs && selectedWorkflow.outputs.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Workflow Outputs
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  color: '#1e40af',
                }}
              >
                <div style={{ marginBottom: '0.25rem', fontWeight: 500 }}>
                  Available after execution:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {selectedWorkflow.outputs.map((output, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: '#dbeafe',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontFamily: 'monospace',
                        fontSize: '0.625rem',
                      }}
                    >
                      {output}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div
            style={{
              padding: '0.75rem',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              color: '#1e40af',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
              ℹ️ Automatic Input Mapping
            </div>
            Input mapping will be configured automatically based on available variables. The
            workflow will receive all matching variables from your current context.
          </div>
        </>
      )}
    </div>
  );
};

export default SubWorkflowStepConfig;
