import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../hooks/useToast';

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
  value?: any;
}

interface Product {
  id: number;
  name: string;
  code: string;
  product_type: string;
  is_active: boolean;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'columns' | 'parameters' | 'filters' | 'charts'>(
    'columns'
  );
  const [reportData, setReportData] = useState<any>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchProducts();
    if (reportId && reportId !== 'new') {
      fetchReport();
    } else {
      setLoading(false);
    }
  }, [reportId]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/products/summary/?is_active=true');
      setProducts(response.data);
    } catch (err: unknown) {
      console.error('Failed to load products:', err);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/templates/${reportId}/`);

      if (!response.ok) throw new Error('Failed to load report');

      const data = await response.json();
      setReport(data);
      setColumns(data.columns || []);
      setParameters(data.parameters || []);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load report';
      setError(errorMsg);
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save report';
      setError(errorMsg);
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

  const handleExecuteReport = async () => {
    if (!reportId || reportId === 'new') {
      setError('Please save the report before executing it');
      return;
    }

    try {
      setExecuting(true);
      setError(null);

      // Build parameters object from parameter values
      const paramValues: Record<string, any> = {};
      parameters.forEach(param => {
        if (param.value !== undefined) {
          paramValues[param.code] = param.value;
        }
      });

      const response = await axios.post(`/api/reports/templates/${reportId}/execute/`, {
        parameters: paramValues,
      });

      if (response.data.success) {
        setReportData(response.data);
        setShowExecuteModal(false);
        toast.success('Report executed successfully!');
      }
    } catch (err: unknown) {
      console.error('Error executing report:', err);
      setError('Failed to execute report');
    } finally {
      setExecuting(false);
    }
  };

  const handleExportCSV = () => {
    if (!reportData || !reportData.data) {
      toast.error('No data to export. Please execute the report first.');
      return;
    }

    try {
      setExporting(true);

      // Convert data to CSV
      const data = reportData.data;
      if (data.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Get headers from first row
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map((row: any) =>
          headers
            .map(header => {
              const value = row[header];
              // Escape quotes and wrap in quotes if contains comma
              const stringValue = String(value ?? '');
              return stringValue.includes(',') || stringValue.includes('"')
                ? `"${stringValue.replace(/"/g, '""')}"`
                : stringValue;
            })
            .join(',')
        ),
      ].join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `${report?.name || 'report'}_${new Date().toISOString().split('T')[0]}.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      console.error('Error exporting CSV:', err);
      setError('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportData || !reportData.data) {
      toast.error('No data to export. Please execute the report first.');
      return;
    }

    try {
      setExporting(true);

      // Create HTML content for PDF
      const data = reportData.data;
      const headers = Object.keys(data[0] || {});

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${report?.name || 'Report'}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #3b82f6; color: white; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>${report?.name || 'Report'}</h1>
          <div class="meta">
            Generated: ${new Date().toLocaleString()}<br>
            Total Records: ${data.length}
          </div>
          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => `
                <tr>
                  ${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    } catch (err: unknown) {
      console.error('Error exporting PDF:', err);
      setError('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateProductReport = async () => {
    const productId = prompt('Enter Product ID to generate report:');
    if (!productId) return;

    try {
      setLoading(true);
      const response = await axios.post('/api/reports/templates/generate-for-product/', {
        product_id: parseInt(productId),
      });

      if (response.data.success) {
        toast.success(`Report generated: ${response.data.data.name}`);
        // Optionally navigate to the new report
        if (onSave) {
          onSave(response.data.data);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate product report');
    } finally {
      setLoading(false);
    }
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
            {reportId && reportId !== 'new' && (
              <>
                <button
                  onClick={() => setShowExecuteModal(true)}
                  disabled={executing}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #10b981',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#10b981',
                    cursor: executing ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  {executing ? 'Executing...' : '▶ Execute'}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={exporting || !reportData}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #6366f1',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#6366f1',
                    cursor: exporting || !reportData ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📊 Export CSV
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={exporting || !reportData}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#ef4444',
                    cursor: exporting || !reportData ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📄 Export PDF
                </button>
              </>
            )}
            <button
              onClick={handleGenerateProductReport}
              style={{
                padding: '8px 16px',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                background: 'white',
                color: '#f59e0b',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              🏷️ Generate Product Report
            </button>
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
                        <option value="account">Account</option>
                        <option value="client">Client</option>
                        <option value="product">Product</option>
                        <option value="product_type">Product Type</option>
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

                  {/* Product selector for product parameter type */}
                  {param.parameter_type === 'product' && (
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
                        Select Product
                      </label>
                      <select
                        value={param.value || ''}
                        onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select Product...</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Product type selector for product_type parameter */}
                  {param.parameter_type === 'product_type' && (
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
                        Select Product Type
                      </label>
                      <select
                        value={param.value || ''}
                        onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">All Types...</option>
                        <option value="SAVINGS">Savings</option>
                        <option value="LOAN">Loan</option>
                        <option value="EXPENSE">Expense</option>
                        <option value="INVESTMENT">Investment</option>
                        <option value="INSURANCE">Insurance</option>
                      </select>
                    </div>
                  )}
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

      {/* Execute Modal */}
      {showExecuteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowExecuteModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 'bold' }}>
              Execute Report
            </h2>

            <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
              Configure parameters for report execution
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {parameters.map((param, index) => (
                <div key={param.id}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '8px',
                    }}
                  >
                    {param.label} {param.is_required && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>

                  {param.parameter_type === 'product' && (
                    <select
                      value={param.value || ''}
                      onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="">Select Product...</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.code})
                        </option>
                      ))}
                    </select>
                  )}

                  {param.parameter_type === 'product_type' && (
                    <select
                      value={param.value || ''}
                      onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="">All Types...</option>
                      <option value="SAVINGS">Savings</option>
                      <option value="LOAN">Loan</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="INVESTMENT">Investment</option>
                      <option value="INSURANCE">Insurance</option>
                    </select>
                  )}

                  {param.parameter_type === 'date' && (
                    <input
                      type="date"
                      value={param.value || ''}
                      onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  )}

                  {param.parameter_type === 'number' && (
                    <input
                      type="number"
                      value={param.value || ''}
                      onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  )}

                  {param.parameter_type === 'text' && (
                    <input
                      type="text"
                      value={param.value || ''}
                      onChange={e => handleUpdateParameter(index, { value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  )}

                  {param.parameter_type === 'boolean' && (
                    <select
                      value={param.value || 'false'}
                      onChange={e =>
                        handleUpdateParameter(index, { value: e.target.value === 'true' })
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div
              style={{ marginTop: '24px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setShowExecuteModal(false)}
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
                onClick={handleExecuteReport}
                disabled={executing}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: executing ? '#9ca3af' : '#10b981',
                  color: 'white',
                  cursor: executing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {executing ? 'Executing...' : 'Execute Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportBuilder;
