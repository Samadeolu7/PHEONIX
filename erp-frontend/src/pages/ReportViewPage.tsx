// src/pages/ReportViewPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader,
  BarChart3,
  FileText,
  Settings,
  Play,
  Filter,
  Table,
  TrendingUp,
} from 'lucide-react';
import { reportsService, ReportTemplate, ReportExecution } from '../services/reportsService';

interface ReportData {
  columns: Array<{
    id: string;
    label: string;
    type: string;
    format?: string;
  }>;
  rows: Array<Record<string, any>>;
  summary?: Record<string, any>;
  charts?: Array<{
    id: string;
    type: string;
    title: string;
    data: any;
  }>;
}

const ReportViewPage: React.FC = () => {
  const { reportCode } = useParams<{ reportCode: string }>();
  const navigate = useNavigate();

  // State management
  const [report, setReport] = useState<ReportTemplate | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [execution, setExecution] = useState<ReportExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parameters state
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [showParametersModal, setShowParametersModal] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState<'data' | 'charts' | 'summary'>('data');

  useEffect(() => {
    if (reportCode) {
      loadReport();
    }
  }, [reportCode]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!reportCode) {
        throw new Error('Report code is required');
      }

      // Get report template by code
      const reportTemplate = await reportsService.getReportTemplateByCode(reportCode);
      setReport(reportTemplate);

      // Set default parameters
      const defaultParams: Record<string, any> = {};
      reportTemplate.parameters?.forEach(param => {
        if (param.default_value) {
          defaultParams[param.code] = param.default_value;
        } else if (param.parameter_type === 'date') {
          // Set default date range based on report config
          const range = reportTemplate.default_date_range || 'current_month';
          const dates = getDefaultDateRange(range);
          if (param.code === 'start_date') {
            defaultParams[param.code] = dates.start;
          } else if (param.code === 'end_date') {
            defaultParams[param.code] = dates.end;
          }
        }
      });

      setParameters(defaultParams);
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
      console.error('Error loading report:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultDateRange = (range: string) => {
    const now = new Date();
    const start = new Date();

    switch (range) {
      case 'current_month':
        start.setDate(1);
        return {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
        };
      case 'last_30_days':
        start.setDate(now.getDate() - 30);
        return {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
        };
      case 'current_year':
        start.setMonth(0, 1);
        return {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
        };
      default:
        start.setDate(now.getDate() - 30);
        return {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
        };
    }
  };

  const executeReport = async () => {
    if (!report) return;

    try {
      setExecuting(true);
      setError(null);

      const result = await reportsService.executeReport(report.id, parameters);
      setExecution(result);

      // Transform the result data for display
      if (result.data) {
        setReportData({
          columns:
            report?.columns?.map(col => ({
              id: col.code,
              label: col.label,
              type: col.format_type || 'text',
              format: col.format_options?.format,
            })) || [],
          rows: result.data,
          summary: result.summary,
          charts: result.charts,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute report');
      console.error('Error executing report:', err);
    } finally {
      setExecuting(false);
    }
  };

  const handleParameterChange = (paramCode: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [paramCode]: value,
    }));
  };

  const handleExecuteWithParameters = () => {
    executeReport();
    setShowParametersModal(false);
  };

  const formatCellValue = (value: any, column: any) => {
    if (value === null || value === undefined) return '-';

    switch (column.type) {
      case 'currency':
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(Number(value) || 0);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'number':
        return new Intl.NumberFormat('en-NG').format(Number(value) || 0);
      default:
        return String(value);
    }
  };

  const exportReport = async (format: 'csv' | 'pdf' | 'excel') => {
    if (!execution) return;

    try {
      const blob = await reportsService.exportReport(execution.id, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report?.name || 'report'}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Failed to export report: ${err.message}`);
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
          background: '#f8fafc',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Loader
            size={48}
            color="#3b82f6"
            style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }}
          />
          <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <AlertCircle size={64} color="#ef4444" style={{ marginBottom: '1rem' }} />
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#111827',
              marginBottom: '0.5rem',
            }}
          >
            Report Not Found
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '2rem' }}>{error}</p>
          <button
            onClick={() => navigate('/reports')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            <ArrowLeft size={16} />
            Back to Reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '1.5rem 2rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => navigate('/reports')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to Reports
              </button>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <BarChart3 size={32} color="#3b82f6" />
                  <h1
                    style={{
                      fontSize: '1.875rem',
                      fontWeight: 'bold',
                      color: '#111827',
                      margin: 0,
                    }}
                  >
                    {report?.name}
                  </h1>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: report?.is_active ? '#dcfce7' : '#f3f4f6',
                        color: report?.is_active ? '#166534' : '#6b7280',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                      }}
                    >
                      {report?.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#f1f5f9',
                        color: '#475569',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'capitalize',
                      }}
                    >
                      {report?.report_type}
                    </span>
                    {report?.is_auto_generated && (
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}
                      >
                        Auto-generated
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ color: '#6b7280', margin: '0 0 0.75rem 0', fontSize: '0.875rem' }}>
                  {report?.description}
                </p>

                {/* Report Metadata */}
                <div
                  style={{ display: 'flex', gap: '2rem', fontSize: '0.75rem', color: '#6b7280' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={12} />
                    Created:{' '}
                    {report?.created_at
                      ? new Date(report.created_at).toLocaleDateString()
                      : 'Unknown'}
                  </div>
                  {report?.linked_account_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <BarChart3 size={12} />
                      Account: {report.linked_account_code}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Play size={12} />
                    Runs: {report?.usage_count || 0}
                  </div>
                  {report?.last_run_at && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <RefreshCw size={12} />
                      Last run: {new Date(report.last_run_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowParametersModal(true)}
                disabled={!report?.parameters?.length}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: report?.parameters?.length ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: report?.parameters?.length ? 1 : 0.5,
                }}
              >
                <Filter size={16} />
                Parameters ({report?.parameters?.length || 0})
              </button>

              <button
                onClick={executeReport}
                disabled={executing || !report}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: executing || !report ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: executing || !report ? 0.5 : 1,
                }}
              >
                {executing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
                {executing ? 'Running...' : 'Execute Report'}
              </button>

              {execution && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => exportReport('csv')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                    }}
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Report Statistics Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                {report?.parameters?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Parameters</div>
            </div>
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                {report?.columns?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Columns</div>
            </div>
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                {report?.charts?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Charts</div>
            </div>
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                {report?.max_rows?.toLocaleString() || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Max Rows</div>
            </div>
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                {report?.allowed_entities?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Data Sources</div>
            </div>
          </div>

          {/* Execution Status */}
          {execution && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 1rem',
                background:
                  execution.status === 'completed'
                    ? '#dcfce7'
                    : execution.status === 'failed'
                      ? '#fef2f2'
                      : '#dbeafe',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              {execution.status === 'completed' && <CheckCircle size={16} color="#166534" />}
              {execution.status === 'failed' && <AlertCircle size={16} color="#dc2626" />}
              {execution.status === 'running' && (
                <Loader size={16} color="#2563eb" className="animate-spin" />
              )}

              <span
                style={{
                  color:
                    execution.status === 'completed'
                      ? '#166534'
                      : execution.status === 'failed'
                        ? '#dc2626'
                        : '#2563eb',
                  fontWeight: '500',
                }}
              >
                {execution.status === 'completed' &&
                  `Report completed - ${reportData?.rows?.length || 0} records`}
                {execution.status === 'failed' && 'Report execution failed'}
                {execution.status === 'running' && 'Report is running...'}
              </span>

              <span style={{ color: '#6b7280', marginLeft: 'auto' }}>
                {new Date(execution.executed_at).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {reportData ? (
          <>
            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '2rem',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              {['data', 'charts', 'summary'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                    color: activeTab === tab ? '#3b82f6' : '#6b7280',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    textTransform: 'capitalize',
                  }}
                >
                  {tab === 'data' && (
                    <Table size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  )}
                  {tab === 'charts' && (
                    <TrendingUp size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  )}
                  {tab === 'summary' && (
                    <FileText size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  )}
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'data' && (
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {reportData.columns.map(column => (
                          <th
                            key={column.id}
                            style={{
                              padding: '1rem',
                              textAlign: 'left',
                              fontWeight: '600',
                              color: '#374151',
                              borderBottom: '1px solid #e5e7eb',
                              fontSize: '0.875rem',
                            }}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((row, index) => (
                        <tr
                          key={index}
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            ':hover': { background: '#f8fafc' },
                          }}
                        >
                          {reportData.columns.map(column => (
                            <td
                              key={column.id}
                              style={{
                                padding: '1rem',
                                fontSize: '0.875rem',
                                color: '#111827',
                              }}
                            >
                              {formatCellValue(row[column.id], column)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'charts' && (
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '2rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  textAlign: 'center',
                }}
              >
                <TrendingUp size={64} color="#d1d5db" style={{ marginBottom: '1rem' }} />
                <h3
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  Charts Coming Soon
                </h3>
                <p style={{ color: '#6b7280' }}>
                  Chart visualization will be available in the next update.
                </p>
              </div>
            )}

            {activeTab === 'summary' && (
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '2rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                {reportData.summary ? (
                  <div>
                    <h3
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '1rem',
                      }}
                    >
                      Report Summary
                    </h3>
                    <pre
                      style={{
                        background: '#f8fafc',
                        padding: '1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(reportData.summary, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <FileText size={64} color="#d1d5db" style={{ marginBottom: '1rem' }} />
                    <h3
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '0.5rem',
                      }}
                    >
                      No Summary Available
                    </h3>
                    <p style={{ color: '#6b7280' }}>This report doesn't include summary data.</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '4rem 2rem',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <BarChart3 size={64} color="#d1d5db" style={{ marginBottom: '1rem' }} />
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '0.5rem',
              }}
            >
              Ready to Execute Report
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              {report?.parameters && report.parameters.length > 0
                ? 'Set your parameters and click "Execute Report" to generate the data.'
                : 'Click "Execute Report" to generate the data.'}
            </p>
            <button
              onClick={executeReport}
              disabled={executing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: executing ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: executing ? 0.5 : 1,
              }}
            >
              {executing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
              {executing ? 'Running...' : 'Execute Report'}
            </button>
          </div>
        )}
      </div>

      {/* Parameters Modal */}
      {showParametersModal && report?.parameters && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '1rem',
              }}
            >
              Report Parameters
            </h3>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              {report.parameters.map(param => (
                <div key={param.code}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {param.label}
                    {param.is_required && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>

                  {param.parameter_type === 'date' ? (
                    <input
                      type="date"
                      value={parameters[param.code] || ''}
                      onChange={e => handleParameterChange(param.code, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    />
                  ) : param.parameter_type === 'select' ? (
                    <select
                      value={parameters[param.code] || ''}
                      onChange={e => handleParameterChange(param.code, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="">Select {param.label}</option>
                      {param.options?.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={param.parameter_type === 'number' ? 'number' : 'text'}
                      value={parameters[param.code] || ''}
                      onChange={e => handleParameterChange(param.code, e.target.value)}
                      placeholder={param.description}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    />
                  )}

                  {param.description && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {param.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowParametersModal(false)}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteWithParameters}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                Execute Report
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default ReportViewPage;
