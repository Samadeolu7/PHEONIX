// src/pages/ReportsListPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Copy,
  Trash2,
  Calendar,
  User,
  BarChart3,
  Clock,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader,
  Eye,
  Edit,
} from 'lucide-react';
import {
  reportsService,
  ReportTemplate,
  ReportExecution,
  ReportCategory,
} from '../services/reportsService';
import { useAuth } from '../contexts/AuthContext';

const ReportsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // State management
  const [reports, setReports] = useState<ReportTemplate[]>([]);
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<ReportExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 12;

  // UI state
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentPage, searchTerm, selectedCategory, selectedModule, showActiveOnly]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load reports with filters
      const reportsResponse = await reportsService.getReportTemplates({
        search: searchTerm || undefined,
        category: selectedCategory || undefined,
        module: selectedModule || undefined,
        is_active: showActiveOnly,
        page: currentPage,
        page_size: pageSize,
      });

      setReports(reportsResponse.results);
      setTotalCount(reportsResponse.count);

      // Load categories and recent executions on first load
      if (currentPage === 1) {
        const [categoriesData, executionsData] = await Promise.all([
          reportsService.getReportCategories(),
          reportsService.getRecentExecutions(5),
        ]);

        setCategories(categoriesData);
        setRecentExecutions(executionsData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (reportId: number, reportName: string) => {
    if (!confirm(`Are you sure you want to delete "${reportName}"?`)) {
      return;
    }

    try {
      await reportsService.deleteReportTemplate(reportId);
      loadData(); // Refresh the list
    } catch (err: any) {
      alert(`Failed to delete report: ${err.message}`);
    }
  };

  const handleDuplicateReport = async (reportId: number, reportName: string) => {
    const newName = prompt(`Enter name for duplicated report:`, `${reportName} (Copy)`);
    if (!newName) return;

    try {
      await reportsService.duplicateReportTemplate(reportId, newName);
      loadData(); // Refresh the list
    } catch (err: any) {
      alert(`Failed to duplicate report: ${err.message}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} color="#10b981" />;
      case 'failed':
        return <AlertCircle size={16} color="#ef4444" />;
      case 'running':
        return <Loader size={16} color="#3b82f6" className="animate-spin" />;
      default:
        return <Clock size={16} color="#6b7280" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading && reports.length === 0) {
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
          <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>Loading reports...</p>
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
                onClick={() => navigate(-1)}
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
                Back
              </button>

              <div>
                <h1
                  style={{
                    fontSize: '1.875rem',
                    fontWeight: 'bold',
                    color: '#111827',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <FileText size={32} color="#3b82f6" />
                  Reports
                </h1>
                <p style={{ color: '#6b7280', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                  Manage and execute your business reports
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: showFilters ? '#3b82f6' : 'white',
                  color: showFilters ? 'white' : '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                <Filter size={16} />
                Filters
              </button>

              <button
                onClick={() => navigate('/reports/new')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
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
                <Plus size={16} />
                New Report
              </button>
            </div>
          </div>

          {/* Search and Stats */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
              <Search
                size={20}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                }}
              />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              <span>{totalCount} reports total</span>
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {/* Sidebar */}
          <div style={{ width: '280px', flexShrink: 0 }}>
            {/* Filters */}
            {showFilters && (
              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '1rem',
                  }}
                >
                  Filters
                </h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">All Categories</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.name}>
                        {category.name} ({category.reports_count})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Module
                  </label>
                  <select
                    value={selectedModule}
                    onChange={e => setSelectedModule(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">All Modules</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                    <option value="Inventory">Inventory</option>
                    <option value="HR">Human Resources</option>
                    <option value="Operations">Operations</option>
                  </select>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showActiveOnly}
                    onChange={e => setShowActiveOnly(e.target.checked)}
                  />
                  Show active reports only
                </label>
              </div>
            )}

            {/* Recent Executions */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '1rem',
                }}
              >
                Recent Executions
              </h3>

              {recentExecutions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {recentExecutions.map(execution => (
                    <div
                      key={execution.id}
                      style={{
                        padding: '0.75rem',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                          {execution.report_name}
                        </span>
                        {getStatusIcon(execution.status)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {formatDate(execution.executed_at)}
                      </div>
                      {execution.result_count > 0 && (
                        <div
                          style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}
                        >
                          {execution.result_count} records
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                    padding: '1rem 0',
                  }}
                >
                  No recent executions
                </p>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1 }}>
            {error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <AlertCircle size={20} color="#dc2626" />
                <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</span>
              </div>
            )}

            {/* Reports Grid */}
            {reports.length > 0 ? (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      view === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
                    gap: '1.5rem',
                    marginBottom: '2rem',
                  }}
                >
                  {reports.map(report => (
                    <div
                      key={report.id}
                      style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #e5e7eb',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'start',
                          justifyContent: 'space-between',
                          marginBottom: '1rem',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <h3
                            style={{
                              fontSize: '1.125rem',
                              fontWeight: '600',
                              color: '#111827',
                              margin: '0 0 0.5rem 0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <BarChart3 size={20} color="#3b82f6" />
                            {report.name}
                          </h3>
                          <p
                            style={{
                              color: '#6b7280',
                              fontSize: '0.875rem',
                              margin: '0 0 0.75rem 0',
                              lineHeight: '1.4',
                            }}
                          >
                            {report.description || 'No description available'}
                          </p>

                          <div
                            style={{
                              display: 'flex',
                              gap: '1rem',
                              fontSize: '0.75rem',
                              color: '#6b7280',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <User size={12} />
                              {report.created_at
                                ? new Date(report.created_at).toLocaleDateString()
                                : 'Unknown'}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Calendar size={12} />
                              {report.category_name || 'Uncategorized'}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: report.is_active ? '#dcfce7' : '#f3f4f6',
                              color: report.is_active ? '#166534' : '#6b7280',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                            }}
                          >
                            {report.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          marginBottom: '1rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        <div
                          style={{
                            padding: '0.5rem',
                            background: '#f1f5f9',
                            borderRadius: '6px',
                            textAlign: 'center',
                            flex: 1,
                          }}
                        >
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>
                            {report.parameters?.length || 0}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Parameters</div>
                        </div>
                        <div
                          style={{
                            padding: '0.5rem',
                            background: '#f1f5f9',
                            borderRadius: '6px',
                            textAlign: 'center',
                            flex: 1,
                          }}
                        >
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>
                            {report.columns?.length || 0}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Columns</div>
                        </div>
                        <div
                          style={{
                            padding: '0.5rem',
                            background: '#f1f5f9',
                            borderRadius: '6px',
                            textAlign: 'center',
                            flex: 1,
                          }}
                        >
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>
                            {report.usage_count || 0}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Runs</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            // Navigate to single report view page using report code
                            navigate(`/report/${report.code}`);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.5rem 0.75rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                          }}
                          title="View Report"
                        >
                          <Eye size={12} />
                          View
                        </button>
                        {/* edit button */}
                        <button
                          onClick={() => navigate(`/reports/${report.id}/edit`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.5rem 0.75rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                          }}
                          title="Edit Report"
                        >
                          <Edit size={12} />
                          Edit
                        </button>
                        {/* <button
                          onClick={() => handleDuplicateReport(report.id, report.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.5rem 0.75rem',
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                          }}
                          title="Duplicate Report"
                        >
                          <Copy size={12} />
                        </button> */}

                        <button
                          onClick={() => handleDeleteReport(report.id, report.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.5rem 0.75rem',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                          }}
                          title="Delete Report"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: currentPage === 1 ? '#f3f4f6' : 'white',
                        color: currentPage === 1 ? '#9ca3af' : '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      Previous
                    </button>

                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: currentPage === totalPages ? '#f3f4f6' : 'white',
                        color: currentPage === totalPages ? '#9ca3af' : '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '4rem 2rem',
                  background: 'white',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <FileText size={64} color="#d1d5db" style={{ marginBottom: '1rem' }} />
                <h3
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  No reports found
                </h3>
                <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                  {searchTerm || selectedCategory || selectedModule
                    ? 'Try adjusting your filters or search terms.'
                    : 'Get started by creating your first report.'}
                </p>
                <button
                  onClick={() => navigate('/reports/new')}
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
                  <Plus size={16} />
                  Create Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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

export default ReportsListPage;
