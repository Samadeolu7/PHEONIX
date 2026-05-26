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
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { discountService, DiscountApplication } from '../../services/discountService';
import { clientService, ClientOption } from '../../services/clientService';
import { receivablesService, CustomerReceivable } from '../../services/receivablesService';
import { useToast } from '../../hooks/useToast';

interface Receivable {
  id: number;
  client: number;
  client_name: string;
  receivable_type: string;
  reference_number: string;
  original_amount: string;
  amount_paid: string;
  balance: string;
  due_date: string;
  status: string;
  aging_bucket: string;
  days_overdue: number;
}

const ApplyDiscountPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedApplication, setSelectedApplication] = useState<DiscountApplication | null>(null);
  const [selectedClient, setSelectedClient] = useState<number>(0);
  const [selectedReceivables, setSelectedReceivables] = useState<number[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [applying, setApplying] = useState(false);

  // Fetch approved applications
  const { data: applicationsData, isLoading: loadingApplications } = useQuery({
    queryKey: ['approved-applications'],
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

  useEffect(() => {
    if (selectedClient) {
      fetchReceivables(selectedClient);
    } else {
      setReceivables([]);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (selectedApplication) {
      setSelectedClient(selectedApplication.client);
    }
  }, [selectedApplication]);

  const fetchClients = async () => {
    try {
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      toast.error('Failed to fetch clients');
      console.error('Error fetching clients:', error);
    }
  };

  const fetchReceivables = async (clientId: number) => {
    try {
      setLoadingReceivables(true);
      // Using the authenticated receivables service
      // Note: We'll fetch all receivables for the client and filter on frontend
      // since the API might not support multiple status values
      const response = await receivablesService.getReceivables({
        client: clientId,
      });

      // Map CustomerReceivable to our local Receivable interface and filter for eligible statuses
      const mappedReceivables = (response.results || [])
        .filter((receivable: CustomerReceivable) =>
          ['pending', 'partial', 'overdue'].includes(receivable.status)
        )
        .map((receivable: CustomerReceivable) => ({
          id: receivable.id,
          client: receivable.client,
          client_name: receivable.client_name,
          receivable_type: receivable.receivable_type,
          reference_number: receivable.reference_number,
          original_amount: receivable.original_amount,
          amount_paid: receivable.amount_paid || '0.00',
          balance: receivable.balance,
          due_date: receivable.due_date,
          status: receivable.status,
          aging_bucket: receivable.aging_bucket,
          days_overdue: receivable.days_overdue,
        }));

      setReceivables(mappedReceivables);
    } catch (error) {
      toast.error('Failed to fetch receivables');
      console.error('Error fetching receivables:', error);
    } finally {
      setLoadingReceivables(false);
    }
  };

  const calculateDiscountAmount = (receivable: Receivable): number => {
    if (!selectedApplication) return 0;

    const program = selectedApplication.program_detail;
    const receivableAmount = parseFloat(receivable.balance);
    const discountValue = parseFloat(selectedApplication.actual_discount_value);

    if (program.discount_type === 'percentage') {
      return (receivableAmount * discountValue) / 100;
    } else if (program.discount_type === 'fixed_amount') {
      return Math.min(discountValue, receivableAmount);
    } else if (program.discount_type === 'full_waiver') {
      return receivableAmount;
    }

    return 0;
  };

  const getTotalDiscountAmount = (): number => {
    return selectedReceivables.reduce((total, receivableId) => {
      const receivable = receivables.find(r => r.id === receivableId);
      if (receivable) {
        return total + calculateDiscountAmount(receivable);
      }
      return total;
    }, 0);
  };

  const handleReceivableToggle = (receivableId: number) => {
    setSelectedReceivables(prev =>
      prev.includes(receivableId) ? prev.filter(id => id !== receivableId) : [...prev, receivableId]
    );
  };

  const handleApplyDiscount = async () => {
    if (!selectedApplication || selectedReceivables.length === 0) {
      toast.error('Please select an application and at least one receivable');
      return;
    }

    try {
      setApplying(true);
      const results = [];

      // Apply discount to each selected receivable
      for (const receivableId of selectedReceivables) {
        const receivable = receivables.find(r => r.id === receivableId);
        if (receivable) {
          const discountAmount = calculateDiscountAmount(receivable);

          const response = await discountService.applyDiscount({
            application_id: selectedApplication.id,
            receivable_id: receivableId,
            discount_amount: discountAmount.toString(),
          });

          results.push(response);
        }
      }

      toast.success(`Successfully applied discount to ${results.length} receivable(s)`);
      navigate('/discounts/applied');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply discount');
      console.error('Error applying discount:', error);
    } finally {
      setApplying(false);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const getReceivableTypeLabel = (type: string) => {
    const labels = {
      invoice: 'Invoice',
      entitlement: 'Fee Entitlement',
      loan: 'Loan',
      other: 'Other',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      partial: { color: 'bg-blue-100 text-blue-800', label: 'Partial' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: 'bg-gray-100 text-gray-800',
      label: status,
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    );
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
            <h1 className="text-2xl font-bold text-gray-900">Apply Discount</h1>
            <p className="text-gray-600">Apply approved discount applications to receivables</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Application Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Select Application */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Select Approved Application
            </h2>

            {approvedApplications.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Approved Applications</h3>
                <p className="text-gray-600">
                  There are no approved discount applications available to apply.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {approvedApplications.map(application => (
                  <div
                    key={application.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedApplication?.id === application.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedApplication(application)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {application.application_number}
                          </h3>
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            Approved
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {application.program_detail?.name || `Program #${application.program}`}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {application.client_detail?.name || `Client #${application.client}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            {formatCurrency(application.actual_discount_value)}
                          </span>
                        </div>
                      </div>
                      {selectedApplication?.id === application.id && (
                        <CheckCircle className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Select Receivables */}
          {selectedApplication && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Select Receivables to Apply Discount
              </h2>

              {loadingReceivables ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">Loading receivables...</span>
                </div>
              ) : receivables.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Outstanding Receivables
                  </h3>
                  <p className="text-gray-600">
                    This client has no outstanding receivables to apply discounts to.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivables.map(receivable => {
                    const discountAmount = calculateDiscountAmount(receivable);
                    const isSelected = selectedReceivables.includes(receivable.id);

                    return (
                      <div
                        key={receivable.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleReceivableToggle(receivable.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium text-gray-900">
                                {receivable.reference_number}
                              </h3>
                              {getStatusBadge(receivable.status)}
                              <span className="text-xs text-gray-500">
                                {getReceivableTypeLabel(receivable.receivable_type)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Original:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(receivable.original_amount)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Balance:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(receivable.balance)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Due Date:</span>
                                <span className="ml-1">
                                  {new Date(receivable.due_date).toLocaleDateString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Discount:</span>
                                <span className="ml-1 font-medium text-green-600">
                                  {formatCurrency(discountAmount)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <CheckCircle className="h-5 w-5 text-blue-600" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Application Summary */}
          {selectedApplication && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Summary</h3>

              <div className="space-y-3">
                <div>
                  <span className="text-sm text-gray-500">Application:</span>
                  <p className="font-medium">{selectedApplication.application_number}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Program:</span>
                  <p className="font-medium">{selectedApplication.program_detail?.name}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Client:</span>
                  <p className="font-medium">{selectedApplication.client_detail?.name}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Discount Type:</span>
                  <p className="font-medium">
                    {selectedApplication.program_detail?.discount_type === 'percentage'
                      ? `${selectedApplication.actual_discount_value}%`
                      : selectedApplication.program_detail?.discount_type === 'full_waiver'
                        ? 'Full Waiver (100%)'
                        : formatCurrency(selectedApplication.actual_discount_value)}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Effective Period:</span>
                  <p className="font-medium">
                    {selectedApplication.effective_from &&
                      new Date(selectedApplication.effective_from).toLocaleDateString()}
                    {selectedApplication.effective_to &&
                      ` - ${new Date(selectedApplication.effective_to).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Discount Summary */}
          {selectedReceivables.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Discount Summary</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Selected Receivables:</span>
                  <span className="font-medium">{selectedReceivables.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Discount:</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(getTotalDiscountAmount())}
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={handleApplyDiscount}
                  disabled={applying || selectedReceivables.length === 0}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {applying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Apply Discount
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplyDiscountPage;
