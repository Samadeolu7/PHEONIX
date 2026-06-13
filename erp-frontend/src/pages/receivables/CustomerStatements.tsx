// src/pages/receivables/CustomerStatements.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receivablesService, CustomerStatement } from '../../services/receivablesService';
import { clientService, ClientOption } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';
import {
  FileText,
  Download,
  Mail,
  Calendar,
  Search,
  Filter,
  Plus,
  Eye,
  Send,
  Users,
  CheckSquare,
  Square,
  ChevronDown,
  RefreshCw,
  X,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface StatementFilters {
  client?: number;
  statement_date__gte?: string;
  statement_date__lte?: string;
  search?: string;
  ordering?: string;
  page?: number;
}

interface GenerateStatementData {
  client: number;
  period_start: string;
  period_end: string;
  include_paid: boolean;
}

interface EmailStatementData {
  email: string;
  subject: string;
  message: string;
}

const CustomerStatements: React.FC = () => {
  const [statements, setStatements] = useState<CustomerStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<StatementFilters>({});
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });

  // Generation modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateData, setGenerateData] = useState<GenerateStatementData>({
    client: 0,
    period_start: '',
    period_end: '',
    include_paid: false,
  });
  const [generateLoading, setGenerateLoading] = useState(false);

  // Batch generation state
  const [showBatchModal, setBatchModal] = useState(false);
  const [batchClientIds, setBatchClientIds] = useState<number[]>([]);
  const [batchPeriodStart, setBatchPeriodStart] = useState('');
  const [batchPeriodEnd, setBatchPeriodEnd] = useState('');
  const [batchIncludePaid, setBatchIncludePaid] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStatement, setEmailStatement] = useState<CustomerStatement | null>(null);
  const [emailData, setEmailData] = useState<EmailStatementData>({
    email: '',
    subject: '',
    message: '',
  });
  const [emailLoading, setEmailLoading] = useState(false);

  // Selection state
  const [selectedStatements, setSelectedStatements] = useState<Set<number>>(new Set());

  const navigate = useNavigate();
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    loadStatements();
  }, [filters]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch {
      setClients([]);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadStatements = async () => {
    try {
      setLoading(true);
      const response = await receivablesService.getStatements(filters);
      setStatements(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading statements:', error);
      showError('Failed to load statements');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof StatementFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  // Generate single statement
  const handleGenerateStatement = async () => {
    if (!generateData.client || !generateData.period_start || !generateData.period_end) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setGenerateLoading(true);
      const result = await receivablesService.generateStatement(generateData);
      showSuccess(`Statement ${result.statement_number} generated successfully`);
      setShowGenerateModal(false);
      setGenerateData({
        client: 0,
        period_start: '',
        period_end: '',
        include_paid: false,
      });
      loadStatements();
    } catch (error) {
      console.error('Error generating statement:', error);
      showError('Failed to generate statement');
    } finally {
      setGenerateLoading(false);
    }
  };

  // Generate batch statements
  const handleBatchGenerate = async () => {
    if (batchClientIds.length === 0 || !batchPeriodStart || !batchPeriodEnd) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setBatchLoading(true);
      const clientIds = batchClientIds;

      let successCount = 0;
      let errorCount = 0;

      for (const clientId of clientIds) {
        try {
          await receivablesService.generateStatement({
            client: clientId,
            period_start: batchPeriodStart,
            period_end: batchPeriodEnd,
            include_paid: batchIncludePaid,
          });
          successCount++;
        } catch (error) {
          console.error(`Error generating statement for client ${clientId}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        showSuccess(`Generated ${successCount} statements successfully`);
      }
      if (errorCount > 0) {
        showError(`Failed to generate ${errorCount} statements`);
      }

      setBatchModal(false);
      setBatchClientIds([]);
      setBatchPeriodStart('');
      setBatchPeriodEnd('');
      setBatchIncludePaid(false);
      loadStatements();
    } catch (error) {
      console.error('Error in batch generation:', error);
      showError('Batch generation failed');
    } finally {
      setBatchLoading(false);
    }
  };

  // Email statement
  const handleEmailStatement = async () => {
    if (!emailStatement || !emailData.email || !emailData.subject) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setEmailLoading(true);
      await receivablesService.sendStatement(emailStatement.id, emailData);
      showSuccess(`Statement emailed to ${emailData.email}`);
      setShowEmailModal(false);
      setEmailStatement(null);
      setEmailData({ email: '', subject: '', message: '' });
      loadStatements();
    } catch (error) {
      console.error('Error sending statement:', error);
      showError('Failed to send statement');
    } finally {
      setEmailLoading(false);
    }
  };

  // Open email modal
  const openEmailModal = (statement: CustomerStatement) => {
    setEmailStatement(statement);
    setEmailData({
      email: '',
      subject: `Account Statement - ${statement.statement_number}`,
      message: `Dear ${statement.client_name},\n\nPlease find attached your account statement for the period ${formatDate(statement.period_start)} to ${formatDate(statement.period_end)}.\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards,\nAccounts Department`,
    });
    setShowEmailModal(true);
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedStatements.size === statements.length) {
      setSelectedStatements(new Set());
    } else {
      setSelectedStatements(new Set(statements.map(s => s.id)));
    }
  };

  const handleSelectStatement = (id: number) => {
    const newSelected = new Set(selectedStatements);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedStatements(newSelected);
  };

  // Download statement
  const handleDownload = (statement: CustomerStatement) => {
    if (statement.pdf_file) {
      window.open(statement.pdf_file, '_blank');
    } else {
      showError('PDF file not available');
    }
  };

  // View statement preview
  const handlePreview = (statement: CustomerStatement) => {
    navigate(`/receivables/statements/${statement.id}/preview`);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Statements</h1>
            <p className="text-gray-600">Generate and manage customer account statements</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setBatchModal(true)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Users className="h-4 w-4 mr-2" />
              Batch Generate
            </button>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate Statement
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center">
              <Filter className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 transform transition-transform ${
                showAdvancedFilters ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Statement number, client name..."
                    value={filters.search || ''}
                    onChange={e => handleFilterChange('search', e.target.value || undefined)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select
                  value={filters.client || ''}
                  onChange={e =>
                    handleFilterChange(
                      'client',
                      e.target.value ? parseInt(e.target.value, 10) : undefined
                    )
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Client"
                  title="Client"
                  disabled={loadingClients}
                >
                  <option value="">{loadingClients ? 'Loading clients...' : 'All clients'}</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.client_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.statement_date__gte || ''}
                  onChange={e =>
                    handleFilterChange('statement_date__gte', e.target.value || undefined)
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.statement_date__lte || ''}
                  onChange={e =>
                    handleFilterChange('statement_date__lte', e.target.value || undefined)
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Statements ({pagination.count})
                  </h3>
                  {selectedStatements.size > 0 && (
                    <span className="text-sm text-gray-600">
                      {selectedStatements.size} selected
                    </span>
                  )}
                </div>
                <button
                  onClick={loadStatements}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center space-x-2 text-gray-500 hover:text-gray-700"
                      >
                        {selectedStatements.size === statements.length && statements.length > 0 ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statement Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opening Balance
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Closing Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Generated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statements.map(statement => {
                    const isSelected = selectedStatements.has(statement.id);
                    return (
                      <tr
                        key={statement.id}
                        className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleSelectStatement(statement.id)}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">
                              {statement.statement_number}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{statement.client_name}</div>
                          <div className="text-sm text-gray-500">ID: {statement.client}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(statement.period_start)} -{' '}
                            {formatDate(statement.period_end)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-900">
                            {formatCurrency(statement.opening_balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(statement.closing_balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(statement.generated_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {statement.sent_at ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Mail className="h-3 w-3 mr-1" />
                              Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <Clock className="h-3 w-3 mr-1" />
                              Generated
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handlePreview(statement)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Preview"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDownload(statement)}
                              className="text-green-600 hover:text-green-800"
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEmailModal(statement)}
                              className="text-purple-600 hover:text-purple-800"
                              title="Email Statement"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.count > 20 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-700">
                    Showing {(pagination.currentPage - 1) * 20 + 1} to{' '}
                    {Math.min(pagination.currentPage * 20, pagination.count)} of {pagination.count}{' '}
                    results
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Generate Statement Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Generate Statement</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  value={generateData.client || ''}
                  onChange={e =>
                    setGenerateData(prev => ({
                      ...prev,
                      client: e.target.value ? parseInt(e.target.value, 10) : 0,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Client"
                  title="Client"
                  disabled={loadingClients}
                >
                  <option value="">{loadingClients ? 'Loading clients...' : 'Select client'}</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.client_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={generateData.period_start}
                  onChange={e =>
                    setGenerateData(prev => ({ ...prev, period_start: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={generateData.period_end}
                  onChange={e => setGenerateData(prev => ({ ...prev, period_end: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="include_paid"
                  checked={generateData.include_paid}
                  onChange={e =>
                    setGenerateData(prev => ({ ...prev, include_paid: e.target.checked }))
                  }
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="include_paid" className="ml-2 text-sm text-gray-700">
                  Include paid transactions
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateStatement}
                disabled={generateLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {generateLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Generate Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Batch Generate Statements</h3>
              <button
                onClick={() => setBatchModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clients <span className="text-red-500">*</span>
                </label>
                <select
                  multiple
                  value={batchClientIds.map(String)}
                  onChange={e => {
                    const selected = Array.from(e.target.selectedOptions).map(option =>
                      parseInt(option.value, 10)
                    );
                    setBatchClientIds(selected.filter(id => !isNaN(id)));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Clients"
                  title="Clients"
                  size={6}
                  disabled={loadingClients}
                >
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.client_id})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Select one or more clients</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={batchPeriodStart}
                  onChange={e => setBatchPeriodStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={batchPeriodEnd}
                  onChange={e => setBatchPeriodEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="batch_include_paid"
                  checked={batchIncludePaid}
                  onChange={e => setBatchIncludePaid(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="batch_include_paid" className="ml-2 text-sm text-gray-700">
                  Include paid transactions
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setBatchModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchGenerate}
                disabled={batchLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {batchLoading ? 'Generating...' : 'Generate All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Statement Modal */}
      {showEmailModal && emailStatement && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Email Statement</h3>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statement</label>
                <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                  {emailStatement.statement_number} - {emailStatement.client_name}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={emailData.email}
                  onChange={e => setEmailData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="client@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={emailData.subject}
                  onChange={e => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailData.message}
                  onChange={e => setEmailData(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={4}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleEmailStatement}
                disabled={emailLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {emailLoading ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerStatements;
