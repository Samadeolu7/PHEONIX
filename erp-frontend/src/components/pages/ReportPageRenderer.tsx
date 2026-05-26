import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { reportsService, ReportTemplate } from '../../services/reportsService';

interface ReportPageRendererProps {
  config: {
    report_id?: number;
    report_code?: string;
    default_parameters?: Record<string, any>;
    show_export?: boolean;
    show_refresh?: boolean;
    show_parameters?: boolean;
  };
}

const ReportPageRenderer: React.FC<ReportPageRendererProps> = ({ config }) => {
  const location = useLocation();
  const passedReport = location.state?.report as ReportTemplate | undefined;

  const [reportTemplate, setReportTemplate] = useState<ReportTemplate | null>(passedReport || null);
  const [reportData, setReportData] = useState<any>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showParams, setShowParams] = useState(config.show_parameters !== false);

  useEffect(() => {
    if (passedReport) {
      // Use passed report data
      setReportTemplate(passedReport);
      initializeParameters(passedReport);
    } else {
      // Fallback to fetching report template only (don't execute)
      fetchReportTemplate();
    }
  }, [config.report_id, config.report_code, passedReport]);

  const initializeParameters = (report: ReportTemplate) => {
    const defaultParams: Record<string, any> = { ...config.default_parameters };

    // Set parameters from report template
    report.parameters?.forEach(param => {
      if (param.default_value) {
        defaultParams[param.code] = param.default_value;
      } else if (param.parameter_type === 'date') {
        // Set default date range based on report config
        const range = report.default_date_range || 'current_month';
        const dates = getDefaultDateRange(range);
        if (param.code === 'start_date') {
          defaultParams[param.code] = dates.start;
        } else if (param.code === 'end_date') {
          defaultParams[param.code] = dates.end;
        }
      }
    });

    setParameters(defaultParams);
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

  const fetchReportTemplate = async () => {
    try {
      setLoading(true);
      setError(null);

      let template: ReportTemplate;

      if (config.report_id) {
        template = await reportsService.getReportTemplate(config.report_id);
      } else if (config.report_code) {
        template = await reportsService.getReportTemplateByCode(config.report_code);
      } else {
        throw new Error('Either report_id or report_code is required');
      }

      setReportTemplate(template);
      initializeParameters(template);
    } catch (err: any) {
      console.error('Report template fetch error:', err);
      setError(err.message || 'Failed to load report template');
    } finally {
      setLoading(false);
    }
  };

  const resolveParameters = (params: Record<string, any>): Record<string, any> => {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Resolve special date values
        if (value === 'today') {
          resolved[key] = new Date().toISOString().split('T')[0];
        } else if (value === 'current_month_start') {
          const now = new Date();
          resolved[key] = new Date(now.getFullYear(), now.getMonth(), 1)
            .toISOString()
            .split('T')[0];
        } else if (value === 'current_year_start') {
          const now = new Date();
          resolved[key] = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        } else if (value === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          resolved[key] = yesterday.toISOString().split('T')[0];
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  };

  const executeReport = async () => {
    if (!reportTemplate) return;

    try {
      setExecuting(true);
      setError(null);

      // Resolve parameters (convert 'today', 'current_month_start', etc. to actual dates)
      const resolvedParams = resolveParameters(parameters);

      const result = await reportsService.executeReport(reportTemplate.id, resolvedParams);
      setReportData(result);
    } catch (err: any) {
      console.error('Report execution error:', err);
      setError(err.message || 'Failed to execute report');
    } finally {
      setExecuting(false);
    }
  };

  const handleParameterChange = (key: string, value: any) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const handleRefresh = () => {
    executeReport();
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '400px',
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
          <p style={{ color: '#6b7280' }}>Loading report template...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            color: '#991b1b',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
            Error Loading Report
          </h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!reportTemplate) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: '#fefce8',
            border: '1px solid #fef08a',
            borderRadius: '8px',
            padding: '16px',
            color: '#854d0e',
          }}
        >
          <p style={{ margin: 0 }}>Report template not found</p>
        </div>
      </div>
    );
  }

  const { data, metadata } = reportData || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '24px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#111827',
                }}
              >
                {reportTemplate.name}
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                {reportTemplate.description}
                {metadata?.executed_at && (
                  <span>
                    {' • Last executed: '}
                    {new Date(metadata.executed_at).toLocaleString()}
                  </span>
                )}
                {metadata?.row_count !== undefined && ` • ${metadata.row_count} rows`}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {reportTemplate.parameters && reportTemplate.parameters.length > 0 && (
                <button
                  onClick={() => setShowParams(!showParams)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: showParams ? '#f3f4f6' : 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  {showParams ? 'Hide' : 'Show'} Parameters
                </button>
              )}

              <button
                onClick={executeReport}
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
                {executing ? '⏳ Running...' : '▶️ Run Report'}
              </button>

              {reportData && config.show_export && (
                <div style={{ position: 'relative' }}>
                  <button
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
                    📥 Export
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Parameters Panel */}
      {showParams && reportTemplate.parameters && reportTemplate.parameters.length > 0 && (
        <div
          style={{
            background: 'white',
            borderBottom: '1px solid #e5e7eb',
            padding: '16px 24px',
          }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h3
              style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#374151' }}
            >
              Report Parameters
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              {reportTemplate.parameters.map(param => (
                <div key={param.code}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#6b7280',
                      marginBottom: '4px',
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
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  ) : param.parameter_type === 'select' ? (
                    <select
                      value={parameters[param.code] || ''}
                      onChange={e => handleParameterChange(param.code, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
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
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  )}

                  {param.description && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', margin: 0 }}>
                      {param.description}
                    </p>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  onClick={executeReport}
                  disabled={executing}
                  style={{
                    width: '100%',
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
                  {executing ? 'Running...' : 'Apply & Run'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Execution Status */}
        {executing && (
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: '24px',
            }}
          >
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
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              Executing Report
            </h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              Please wait while we generate your report...
            </p>
          </div>
        )}

        {/* Summary Stats */}
        {data && data.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                Total Records
              </div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {data.length.toLocaleString()}
              </div>
            </div>

            {/* Add more summary cards based on data */}
          </div>
        )}

        {/* Data Table */}
        {data && data.length > 0 && (
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {Object.keys(data[0]).map(key => (
                      <th
                        key={key}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#374151',
                          textTransform: 'uppercase',
                        }}
                      >
                        {key.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row: any, idx: number) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {Object.values(row).map((value: any, colIdx: number) => (
                        <td
                          key={colIdx}
                          style={{
                            padding: '12px 16px',
                            fontSize: '14px',
                            color: '#111827',
                          }}
                        >
                          {value !== null && value !== undefined ? String(value) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State - No Data Yet */}
        {!reportData && !executing && (
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              Ready to Run Report
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
              {reportTemplate.parameters && reportTemplate.parameters.length > 0
                ? 'Set your parameters and click "Run Report" to generate the data.'
                : 'Click "Run Report" to generate the data.'}
            </p>
            <button
              onClick={executeReport}
              disabled={executing}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 500,
              }}
            >
              ▶️ Run Report
            </button>
          </div>
        )}

        {/* Empty State - No Results */}
        {reportData && (!data || data.length === 0) && (
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              No Data Found
            </h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              The report executed successfully but returned no results. Try adjusting your
              parameters.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ReportPageRenderer;
