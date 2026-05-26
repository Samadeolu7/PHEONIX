import React, { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';

interface Column {
  id: string;
  name: string;
  code: string;
  label: string;
  column_type: 'field' | 'calculation' | 'aggregation';
  field_path?: string;
  format_type: string;
  is_visible: boolean;
  order: number;
}

interface Parameter {
  id?: string;
  name: string;
  code: string;
  parameter_type: string;
  label: string;
  is_required: boolean;
  order: number;
}

interface ReportBuilderProps {
  reportId?: string;
  onSave?: (report: any) => void;
  onCancel?: () => void;
}

const ReportBuilder: React.FC<ReportBuilderProps> = ({ reportId, onSave, onCancel }) => {
  const [report, setReport] = useState<any>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'columns' | 'parameters' | 'filters' | 'charts'>(
    'columns'
  );
  const toast = useToast();

  useEffect(() => {
    if (reportId && reportId !== 'new') {
      fetchReport();
    } else {
      setLoading(false);
    }
  }, [reportId]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/templates/${reportId}/`);

      if (!response.ok) throw new Error('Failed to load report');

      const data = await response.json();
      setReport(data);
      setColumns(data.columns || []);
      setParameters(data.parameters || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const payload = {
        ...report,
        columns,
        parameters,
      };

      const url =
        reportId && reportId !== 'new'
          ? `/api/reports/templates/${reportId}/`
          : '/api/reports/templates/';

      const method = reportId && reportId !== 'new' ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save report');

      const saved = await response.json();

      if (onSave) {
        onSave(saved);
      } else {
        toast.success('Report saved successfully!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddColumn = () => {
    const newColumn: Column = {
      id: `col_${Date.now()}`,
      name: '',
      code: '',
      label: 'New Column',
      column_type: 'field',
      format_type: 'text',
      is_visible: true,
      order: columns.length,
    };
    setColumns([...columns, newColumn]);
  };

  const handleUpdateColumn = (index: number, updates: Partial<Column>) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], ...updates };
    setColumns(updated);
  };

  const handleDeleteColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleAddParameter = () => {
    const newParam: Parameter = {
      id: `param_${Date.now()}`,
      name: '',
      code: '',
      parameter_type: 'text',
      label: 'New Parameter',
      is_required: false,
      order: parameters.length,
    };
    setParameters([...parameters, newParam]);
  };

  const handleUpdateParameter = (index: number, updates: Partial<Parameter>) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], ...updates };
    setParameters(updated);
  };

  const handleDeleteParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280' }}>Loading report...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '16px 24px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold' }}>
              {reportId === 'new' ? 'Create New Report' : 'Edit Report'}
            </h1>
            {report && (
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{report.name}</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: saving ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            padding: '12px 24px',
            color: '#991b1b',
          }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>⚠️ {error}</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '0' }}>
          {(['columns', 'parameters', 'filters', 'charts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === tab ? '#3b82f6' : '#6b7280',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Columns Tab */}
        {activeTab === 'columns' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Columns</h2>
              <button
                onClick={handleAddColumn}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                + Add Column
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {columns.map((column, index) => (
                <div
                  key={column.id}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr auto',
                      gap: '12px',
                      alignItems: 'end',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Label
                      </label>
                      <input
                        type="text"
                        value={column.label}
                        onChange={e => handleUpdateColumn(index, { label: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Type
                      </label>
                      <select
                        value={column.column_type}
                        onChange={e =>
                          handleUpdateColumn(index, { column_type: e.target.value as any })
                        }
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="field">Field</option>
                        <option value="calculation">Calculation</option>
                        <option value="aggregation">Aggregation</option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Format
                      </label>
                      <select
                        value={column.format_type}
                        onChange={e => handleUpdateColumn(index, { format_type: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="currency">Currency</option>
                        <option value="percentage">Percentage</option>
                        <option value="date">Date</option>
                      </select>
                    </div>

                    <button
                      onClick={() => handleDeleteColumn(index)}
                      style={{
                        padding: '8px',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      🗑️
                    </button>
                  </div>

                  {column.column_type === 'field' && (
                    <div style={{ marginTop: '12px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Field Path
                      </label>
                      <input
                        type="text"
                        value={column.field_path || ''}
                        onChange={e => handleUpdateColumn(index, { field_path: e.target.value })}
                        placeholder="e.g., transaction__transaction_date"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {columns.length === 0 && (
                <div
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '48px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    No columns yet. Click "Add Column" to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Parameters Tab */}
        {activeTab === 'parameters' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Parameters</h2>
              <button
                onClick={handleAddParameter}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                + Add Parameter
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {parameters.map((param, index) => (
                <div
                  key={param.id}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr auto',
                      gap: '12px',
                      alignItems: 'end',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Label
                      </label>
                      <input
                        type="text"
                        value={param.label}
                        onChange={e => handleUpdateParameter(index, { label: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Code
                      </label>
                      <input
                        type="text"
                        value={param.code}
                        onChange={e => handleUpdateParameter(index, { code: e.target.value })}
                        placeholder="e.g., start_date"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Type
                      </label>
                      <select
                        value={param.parameter_type}
                        onChange={e =>
                          handleUpdateParameter(index, { parameter_type: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="date_range">Date Range</option>
                        <option value="select">Select</option>
                        <option value="boolean">Yes/No</option>
                      </select>
                    </div>

                    <button
                      onClick={() => handleDeleteParameter(index)}
                      style={{
                        padding: '8px',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {parameters.length === 0 && (
                <div
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '48px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    No parameters yet. Click "Add Parameter" to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Other tabs placeholder */}
        {(activeTab === 'filters' || activeTab === 'charts') && (
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <p style={{ margin: 0, color: '#6b7280' }}>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} configuration coming soon...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportBuilder;
