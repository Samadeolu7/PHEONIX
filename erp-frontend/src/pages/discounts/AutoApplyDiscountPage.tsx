import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  DollarSign,
  FileText,
  User,
  Calendar,
  CheckCircle,
  AlertCircle,
  Calculator,
  Zap,
  Users,
  TrendingUp,
  RefreshCw,
  Play,
  Pause,
  BarChart3,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { discountService, DiscountApplication } from '../../services/discountService';
import { clientService, ClientOption } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';

interface AutoApplyResult {
  client_id: number;
  client_name: string;
  applications_processed: number;
  receivables_processed: number;
  total_discount_amount: string;
  success: boolean;
  error_message?: string;
}

interface AutoApplyProgress {
  total_clients: number;
  processed_clients: number;
  total_applications: number;
  processed_applications: number;
  total_discount_amount: string;
  is_running: boolean;
  current_client?: string;
}

const AutoApplyDiscountPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<AutoApplyProgress | null>(null);
  const [results, setResults] = useState<AutoApplyResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Fetch approved applications
  const { data: applicationsData, isLoading: loadingApplications } = useQuery({
    queryKey: ['approved-applications-auto'],
    queryFn: async () => {
      const response = await discountService.getDiscountApplications({
        status: 'approved',
        ordering: '-created_at',
      });
      return response;
    },
  });

  const approvedApplications = applicationsData?.results || [];

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      toast.error('Failed to fetch clients');
      console.error('Error fetching clients:', error);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleClientToggle = (clientId: number) => {
    setSelectedClients(prev =>
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    );
  };

  const handleSelectAllClients = () => {
    if (selectedClients.length === filteredClients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(filteredClients.map(client => client.id));
    }
  };

  const handleAutoApply = async () => {
    if (selectedClients.length === 0) {
      toast.error('Please select at least one client');
      return;
    }

    try {
      setIsProcessing(true);
      setShowResults(false);
      setResults([]);

      // Initialize progress
      setProgress({
        total_clients: selectedClients.length,
        processed_clients: 0,
        total_applications: 0, // Will be updated based on API response
        processed_applications: 0,
        total_discount_amount: '0.00',
        is_running: true,
      });

      const autoApplyResults: AutoApplyResult[] = [];
      let totalDiscountAmount = 0;

      // Process each client
      for (let i = 0; i < selectedClients.length; i++) {
        const clientId = selectedClients[i];
        const client = clients.find(c => c.id === clientId);

        // Update progress
        setProgress(prev =>
          prev
            ? {
                ...prev,
                processed_clients: i,
                current_client: client?.name,
              }
            : null
        );

        try {
          // Call auto-apply API for this client (only send client_id)
          const response = await discountService.autoApplyDiscounts({
            client_id: clientId,
          });

          autoApplyResults.push({
            client_id: clientId,
            client_name: client?.name || `Client #${clientId}`,
            applications_processed: response.applications_processed || response.count || 0,
            receivables_processed: response.receivables_processed || 0,
            total_discount_amount: response.total_discount_amount || '0.00',
            success: true,
          });

          totalDiscountAmount += parseFloat(response.total_discount_amount || '0');
        } catch (error: any) {
          autoApplyResults.push({
            client_id: clientId,
            client_name: client?.name || `Client #${clientId}`,
            applications_processed: 0,
            receivables_processed: 0,
            total_discount_amount: '0.00',
            success: false,
            error_message: error.response?.data?.message || error.message || 'Unknown error',
          });
        }

        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final progress update
      setProgress(prev =>
        prev
          ? {
              ...prev,
              processed_clients: selectedClients.length,
              processed_applications: autoApplyResults.reduce(
                (sum, r) => sum + r.applications_processed,
                0
              ),
              total_discount_amount: totalDiscountAmount.toString(),
              is_running: false,
              current_client: undefined,
            }
          : null
      );

      setResults(autoApplyResults);
      setShowResults(true);

      const successCount = autoApplyResults.filter(r => r.success).length;
      const failureCount = autoApplyResults.filter(r => !r.success).length;

      if (failureCount === 0) {
        toast.success(
          `Successfully processed ${successCount} clients with total discount of $${totalDiscountAmount.toFixed(2)}`
        );
      } else {
        toast.warning(`Processed ${successCount} clients successfully, ${failureCount} failed`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to auto-apply discounts');
      console.error('Error auto-applying discounts:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const getProgressPercentage = () => {
    if (!progress || progress.total_clients === 0) return 0;
    return Math.round((progress.processed_clients / progress.total_clients) * 100);
  };

  if (loadingApplications) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/discounts/applied')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              Auto-Apply Discounts
            </h1>
            <p className="text-gray-600">
              Bulk apply approved discount applications to multiple clients
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResults(!showResults)}
            disabled={results.length === 0}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            {showResults ? 'Hide Results' : 'Show Results'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isProcessing && progress && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
              Processing Auto-Apply
            </h3>
            <span className="text-sm font-medium text-blue-600">{getProgressPercentage()}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Clients:</span>
              <span className="ml-1 font-medium">
                {progress.processed_clients}/{progress.total_clients}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Applications:</span>
              <span className="ml-1 font-medium">
                {progress.processed_applications}/{progress.total_applications}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Total Discount:</span>
              <span className="ml-1 font-medium text-green-600">
                {formatCurrency(progress.total_discount_amount)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Current:</span>
              <span className="ml-1 font-medium">
                {progress.current_client || 'Initializing...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {showResults && results.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Auto-Apply Results
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {results.filter(r => r.success).length}
              </p>
            </div>

            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-900">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-600">
                {results.filter(r => !r.success).length}
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900">Total Discount</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(
                  results.reduce((sum, r) => sum + parseFloat(r.total_discount_amount), 0)
                )}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applications
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receivables
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Discount Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map(result => (
                  <tr key={result.client_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{result.client_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {result.success ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center gap-1 w-fit">
                          <CheckCircle className="h-3 w-3" />
                          Success
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full flex items-center gap-1 w-fit">
                          <AlertCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.applications_processed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.receivables_processed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(result.total_discount_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 max-w-xs truncate">
                      {result.error_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* Select Clients */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Clients for Auto-Apply
            </h2>
            <button
              onClick={handleSelectAllClients}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {selectedClients.length === filteredClients.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredClients.map(client => (
              <div
                key={client.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedClients.includes(client.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleClientToggle(client.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm">{client.name}</h3>
                    <p className="text-xs text-gray-500">Client ID: {client.id}</p>
                  </div>
                  {selectedClients.includes(client.id) && (
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Auto-Apply Process</p>
                <p>
                  All approved discount applications for the selected clients will be automatically
                  applied to their outstanding receivables.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Available Applications Info */}
        {approvedApplications.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Available Approved Applications ({approvedApplications.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {approvedApplications.slice(0, 6).map(application => (
                <div
                  key={application.id}
                  className="p-3 border rounded-lg bg-green-50 border-green-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">
                      {application.application_number}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-1">
                    {application.program_detail?.name || `Program #${application.program}`}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {application.client_detail?.name || `Client #${application.client}`}
                    </span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(application.actual_discount_value)}
                    </span>
                  </div>
                </div>
              ))}
              {approvedApplications.length > 6 && (
                <div className="p-3 border rounded-lg bg-gray-50 border-gray-200 flex items-center justify-center">
                  <span className="text-sm text-gray-600">
                    +{approvedApplications.length - 6} more applications
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Ready to Process</h3>
            <p className="text-gray-600">
              Auto-apply all approved applications to {selectedClients.length} selected client
              {selectedClients.length !== 1 ? 's' : ''}
            </p>
            {selectedClients.length > 0 && approvedApplications.length > 0 && (
              <p className="text-sm text-blue-600 mt-1">
                {approvedApplications.length} approved applications will be processed for each
                client
              </p>
            )}
          </div>
          <button
            onClick={handleAutoApply}
            disabled={isProcessing || selectedClients.length === 0}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Auto-Apply
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoApplyDiscountPage;
