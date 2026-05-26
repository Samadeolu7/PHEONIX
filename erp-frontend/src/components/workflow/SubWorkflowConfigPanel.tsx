import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface MasterTemplate {
  id: number;
  code: string;
  name: string;
  description: string;
  account_type: string;
  has_approval: boolean;
  is_dynamic_contra: boolean;
  has_validation: boolean;
  required_parameters: Record<string, any>;
  required_form_inputs: Record<string, any>;
  usage_stats: {
    total_bindings: number;
    total_executions: number;
    last_used: string | null;
  };
}

interface SubWorkflowConfigPanelProps {
  config: any;
  onChange: (config: any) => void;
  variables: Array<{ name: string; type: string; path: string }>;
}

const SubWorkflowConfigPanel: React.FC<SubWorkflowConfigPanelProps> = ({
  config,
  onChange,
  variables,
}) => {
  const [masterTemplates, setMasterTemplates] = useState<Record<string, MasterTemplate[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<MasterTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMasterTemplates, setShowMasterTemplates] = useState(
    config.workflow_type === 'master_template'
  );

  useEffect(() => {
    if (showMasterTemplates) {
      fetchMasterTemplates();
    }
  }, [showMasterTemplates]);

  useEffect(() => {
    // Load selected template if workflow_code is set
    if (config.workflow_code && masterTemplates) {
      const allTemplates = Object.values(masterTemplates).flat();
      const template = allTemplates.find(t => t.code === config.workflow_code);
      if (template) {
        setSelectedTemplate(template);
      }
    }
  }, [config.workflow_code, masterTemplates]);

  const fetchMasterTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automations/workflows/master-templates/');
      const data = await response.json();
      setMasterTemplates(data.master_templates);
    } catch (error) {
      console.error('Failed to load master templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: MasterTemplate) => {
    setSelectedTemplate(template);

    // Initialize config with template
    const newConfig = {
      ...config,
      workflow_code: template.code,
      workflow_type: 'master_template',
      parameters: {},
      inputs: { form: {} },
      wait_for_completion: true,
    };

    onChange(newConfig);
  };

  const handleParameterChange = (paramName: string, value: any) => {
    onChange({
      ...config,
      parameters: {
        ...config.parameters,
        [paramName]: value,
      },
    });
  };

  const handleFormInputChange = (inputName: string, value: any) => {
    onChange({
      ...config,
      inputs: {
        ...config.inputs,
        form: {
          ...(config.inputs?.form || {}),
          [inputName]: value,
        },
      },
    });
  };

  const renderVariableSelector = (currentValue: string, onChange: (value: string) => void) => {
    const isVariable = currentValue?.startsWith('${');
    const [mode, setMode] = useState<'variable' | 'value'>(isVariable ? 'variable' : 'value');

    return (
      <div>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setMode('value')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: mode === 'value' ? '#3b82f6' : 'white',
              color: mode === 'value' ? 'white' : '#374151',
            }}
          >
            Fixed Value
          </button>
          <button
            type="button"
            onClick={() => setMode('variable')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: mode === 'variable' ? '#3b82f6' : 'white',
              color: mode === 'variable' ? 'white' : '#374151',
            }}
          >
            Variable
          </button>
        </div>

        {mode === 'variable' ? (
          <select
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">-- Select variable --</option>
            {variables.map(v => (
              <option key={v.path} value={`\${${v.path}}`}>
                {v.name} ({v.type})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={currentValue?.replace(/\$\{|\}/g, '') || ''}
            onChange={e => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
            placeholder="Enter value..."
          />
        )}
      </div>
    );
  };

  const filteredTemplates = Object.entries(masterTemplates).reduce(
    (acc, [accountType, templates]) => {
      const filtered = templates.filter(
        t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.code.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (filtered.length > 0) {
        acc[accountType] = filtered;
      }
      return acc;
    },
    {} as Record<string, MasterTemplate[]>
  );

  return (
    <div style={{ padding: '16px' }}>
      {/* Workflow Type Selection */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#111827' }}>
          Subworkflow Type
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={() => {
              setShowMasterTemplates(true);
              onChange({ ...config, workflow_type: 'master_template' });
            }}
            style={{
              flex: 1,
              padding: '12px',
              border: showMasterTemplates ? '2px solid #3b82f6' : '1px solid #d1d5db',
              borderRadius: '8px',
              background: showMasterTemplates ? '#eff6ff' : 'white',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, color: '#111827' }}>✨ Master Template</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Reusable transaction workflows
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMasterTemplates(false);
              setSelectedTemplate(null);
              onChange({ ...config, workflow_type: undefined });
            }}
            style={{
              flex: 1,
              padding: '12px',
              border: !showMasterTemplates ? '2px solid #3b82f6' : '1px solid #d1d5db',
              borderRadius: '8px',
              background: !showMasterTemplates ? '#eff6ff' : 'white',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, color: '#111827' }}>🔧 Custom Workflow</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Call any workflow by ID/code
            </div>
          </button>
        </div>
      </div>

      {showMasterTemplates ? (
        <>
          {/* Master Template Selection */}
          {!selectedTemplate ? (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={18}
                    style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search master templates..."
                    style={{
                      width: '100%',
                      padding: '10px 10px 10px 40px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  Loading templates...
                </div>
              ) : Object.keys(filteredTemplates).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  No templates found
                </div>
              ) : (
                Object.entries(filteredTemplates).map(([accountType, templates]) => (
                  <div key={accountType} style={{ marginBottom: '24px' }}>
                    <h4
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '12px',
                      }}
                    >
                      {accountType} Transactions
                    </h4>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {templates.map(template => (
                        <div
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          style={{
                            padding: '16px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: 'white',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#3b82f6';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '8px',
                            }}
                          >
                            <div style={{ fontWeight: 600, color: '#111827' }}>{template.name}</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {template.has_approval && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    borderRadius: '4px',
                                  }}
                                >
                                  Approval
                                </span>
                              )}
                              {template.is_dynamic_contra && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    background: '#dbeafe',
                                    color: '#1e40af',
                                    borderRadius: '4px',
                                  }}
                                >
                                  Dynamic
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                            {template.description}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                            {template.usage_stats.total_bindings} accounts •{' '}
                            {template.usage_stats.total_executions} executions
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Parameter Configuration */
            <div>
              <div
                style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'between',
                    alignItems: 'start',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <CheckCircle size={18} style={{ color: '#10b981' }} />
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {selectedTemplate.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {selectedTemplate.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(null);
                      onChange({ ...config, workflow_code: '', parameters: {}, inputs: {} });
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Required Parameters */}
              <div style={{ marginBottom: '24px' }}>
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '12px',
                  }}
                >
                  📋 Workflow Parameters
                </h4>
                <div style={{ display: 'grid', gap: '16px' }}>
                  {Object.entries(selectedTemplate.required_parameters).map(
                    ([paramName, paramInfo]: [string, any]) => (
                      <div key={paramName}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: 500,
                            marginBottom: '6px',
                          }}
                        >
                          {paramInfo.label}
                          {paramInfo.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                          {paramInfo.description}
                        </div>
                        {renderVariableSelector(config.parameters?.[paramName] || '', value =>
                          handleParameterChange(paramName, value)
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Form Inputs */}
              <div>
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '12px',
                  }}
                >
                  📝 Transaction Form Data
                </h4>
                <div style={{ display: 'grid', gap: '16px' }}>
                  {Object.entries(selectedTemplate.required_form_inputs).map(
                    ([inputName, inputInfo]: [string, any]) => (
                      <div key={inputName}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: 500,
                            marginBottom: '6px',
                          }}
                        >
                          {inputInfo.label || inputName}
                          {inputInfo.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        {renderVariableSelector(config.inputs?.form?.[inputName] || '', value =>
                          handleFormInputChange(inputName, value)
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div
                style={{
                  marginTop: '24px',
                  padding: '12px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <Info size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', color: '#1e40af' }}>
                  This subworkflow will execute the <strong>{selectedTemplate.name}</strong>{' '}
                  template with your custom parameters. You can use variables from your current
                  workflow or provide fixed values.
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Custom Workflow Configuration */
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}
            >
              Workflow Code or ID
            </label>
            <input
              type="text"
              value={config.workflow_code || config.workflow_id || ''}
              onChange={e => {
                const value = e.target.value;
                onChange({
                  ...config,
                  workflow_code: isNaN(Number(value)) ? value : undefined,
                  workflow_id: isNaN(Number(value)) ? undefined : Number(value),
                });
              }}
              placeholder="e.g., send_welcome_email or 123"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}
            >
              Input Variables (JSON)
            </label>
            <textarea
              value={JSON.stringify(config.inputs || {}, null, 2)}
              onChange={e => {
                try {
                  const inputs = JSON.parse(e.target.value);
                  onChange({ ...config, inputs });
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
          </div>
        </div>
      )}

      {/* Wait for Completion */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.wait_for_completion !== false}
            onChange={e => onChange({ ...config, wait_for_completion: e.target.checked })}
          />
          <span style={{ fontSize: '14px', color: '#374151' }}>
            Wait for subworkflow to complete
          </span>
        </label>
        <div style={{ fontSize: '12px', color: '#6b7280', marginLeft: '28px', marginTop: '4px' }}>
          If checked, the parent workflow will pause until this subworkflow finishes
        </div>
      </div>
    </div>
  );
};

export default SubWorkflowConfigPanel;
