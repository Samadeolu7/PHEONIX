import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Users,
  Eye,
  Send,
  CheckCircle,
  AlertCircle,
  X,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Settings,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { incomeFeeStructureService, FeeStructure } from '../../services/incomeFeeStructureService';
import { clientService, Client } from '../../services/clientService';
import { invoiceService, BulkInvoiceData, BulkInvoiceResult } from '../../services/invoiceService';

// Types for the wizard
interface InvoicePreview {
  client_id: number;
  client_name: string;
  amount: string;
  invoice_number?: string;
  status: 'ready' | 'error';
  error_message?: string;
}

interface BulkInvoiceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: BulkInvoiceResult) => void;
}

const BulkInvoiceWizard: React.FC<BulkInvoiceWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data state
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedFeeStructure, setSelectedFeeStructure] = useState<FeeStructure | null>(null);
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkInvoiceResult | null>(null);

  // Form data
  const [formData, setFormData] = useState<BulkInvoiceData>({
    fee_structure: 0,
    clients: [],
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
    description: '',
    send_immediately: false,
    email_template: '',
  });

  // Filters for client selection
  const [clientFilters, setClientFilters] = useState({
    search: '',
    status: 'active' as const,
    usage_context: '' as string,
    classification: undefined as number | undefined,
  });
  const [classifications, setClassifications] = useState<{ id: number; name: string }[]>([]);

  // Load initial data

  const loadClassifications = async () => {
    try {
      const opts = await clientService.getClassifications();
      setClassifications(opts);
    } catch (e) {
      console.error('Failed to load classifications', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFeeStructures();
      loadClients();
      loadClassifications();
    }
  }, [isOpen]);

  const loadFeeStructures = async () => {
    try {
      setIsLoading(true);
      const response = await incomeFeeStructureService.getFeeStructures({
        is_active: true,
        ordering: 'name',
      });
      setFeeStructures(response.results || []);
    } catch (error) {
      console.error('Error loading fee structures:', error);
      showError('Failed to load fee structures');
    } finally {
      setIsLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const response = await clientService.getClients({
        ...clientFilters,
        ordering: 'full_name',
      });
      setClients(response.results || []);
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  };

  // Reload clients when filters change
  useEffect(() => {
    if (isOpen && currentStep === 2) {
      loadClients();
    }
  }, [clientFilters, isOpen, currentStep]);

  const handleFeeStructureSelect = (feeStructure: FeeStructure) => {
    setSelectedFeeStructure(feeStructure);
    setFormData(prev => ({
      ...prev,
      fee_structure: feeStructure.id,
      description: `${feeStructure.name} - Bulk Invoice`,
    }));
  };

  const handleClientToggle = (clientId: number) => {
    setSelectedClients(prev => {
      const newSelection = prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId];

      setFormData(prevForm => ({
        ...prevForm,
        clients: newSelection,
      }));

      return newSelection;
    });
  };

  const handleSelectAllClients = () => {
    const allClientIds = clients.map(client => client.id);
    setSelectedClients(allClientIds);
    setFormData(prev => ({
      ...prev,
      clients: allClientIds,
    }));
  };

  const handleDeselectAllClients = () => {
    setSelectedClients([]);
    setFormData(prev => ({
      ...prev,
      clients: [],
    }));
  };

  const generatePreview = () => {
    if (!selectedFeeStructure) return;

    const preview: InvoicePreview[] = selectedClients.map(clientId => {
      const client = clients.find(c => c.id === clientId);
      if (!client) {
        return {
          client_id: clientId,
          client_name: 'Unknown Client',
          amount: '0.00',
          status: 'error' as const,
          error_message: 'Client not found',
        };
      }

      return {
        client_id: clientId,
        client_name: client.full_name,
        amount: selectedFeeStructure.base_amount,
        status: 'ready' as const,
      };
    });

    setInvoicePreview(preview);
  };

  const handleSubmit = async () => {
    if (!selectedFeeStructure || selectedClients.length === 0) {
      showError('Please select a fee structure and at least one client');
      return;
    }

    try {
      setIsSubmitting(true);

      // Use the actual API service for bulk invoice creation
      const result = await invoiceService.createBulkInvoices(formData);

      setBulkResult(result);
      setCurrentStep(4);

      if (result.success) {
        success(`Successfully created ${result.created_count} invoices`);
      } else {
        showError(`Bulk invoice creation completed with ${result.failed_count} failures`);
      }

      if (onComplete) {
        onComplete(result);
      }
    } catch (error: any) {
      console.error('Error creating bulk invoices:', error);

      // Create a fallback result for error cases
      const errorResult: BulkInvoiceResult = {
        success: false,
        created_count: 0,
        failed_count: selectedClients.length,
        invoices: [],
        errors: [error.message || 'Failed to create bulk invoices'],
      };

      setBulkResult(errorResult);
      setCurrentStep(4);
      showError(error.message || 'Failed to create bulk invoices');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1 && !selectedFeeStructure) {
      showError('Please select a fee structure');
      return;
    }

    if (currentStep === 2 && selectedClients.length === 0) {
      showError('Please select at least one client');
      return;
    }

    if (currentStep === 2) {
      generatePreview();
    }

    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSelectedFeeStructure(null);
    setSelectedClients([]);
    setInvoicePreview([]);
    setBulkResult(null);
    setFormData({
      fee_structure: 0,
      clients: [],
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: '',
      send_immediately: false,
      email_template: '',
    });
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6" />
              <h2 className="text-xl font-semibold">Bulk Invoice Generation</h2>
            </div>
            <button onClick={handleClose} className="text-white hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="mt-4 flex items-center space-x-4">
            {[
              { step: 1, label: 'Fee Structure', icon: Settings },
              { step: 2, label: 'Select Clients', icon: Users },
              { step: 3, label: 'Preview & Confirm', icon: Eye },
              { step: 4, label: 'Results', icon: CheckCircle },
            ].map(({ step, label, icon: Icon }) => (
              <div key={step} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    currentStep >= step
                      ? 'bg-white text-blue-600 border-white'
                      : 'border-blue-300 text-blue-300'
                  }`}
                >
                  {currentStep > step ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`ml-2 text-sm ${currentStep >= step ? 'text-white' : 'text-blue-300'}`}
                >
                  {label}
                </span>
                {step < 4 && <ChevronRight className="w-4 h-4 ml-2 text-blue-300" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Step 1: Fee Structure Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Fee Structure</h3>
                <p className="text-gray-600 mb-4">
                  Choose the fee structure to use for generating invoices. This will determine the
                  amount and description for all invoices.
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600">Loading fee structures...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {feeStructures.map(feeStructure => (
                    <div
                      key={feeStructure.id}
                      onClick={() => handleFeeStructureSelect(feeStructure)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedFeeStructure?.id === feeStructure.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{feeStructure.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">Code: {feeStructure.code}</p>
                          <p className="text-sm text-gray-500 mt-1">{feeStructure.description}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            {formatCurrency(feeStructure.base_amount)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{feeStructure.frequency}</div>
                        </div>
                      </div>

                      {feeStructure.is_recurring && (
                        <div className="mt-2 flex items-center text-xs text-blue-600">
                          <Calendar className="w-3 h-3 mr-1" />
                          Recurring
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {feeStructures.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <div className="text-gray-500">
                    <Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No Fee Structures Found
                    </h3>
                    <p className="text-gray-600">
                      You need to create at least one active fee structure before generating bulk
                      invoices.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Client Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Clients</h3>
                <p className="text-gray-600 mb-4">
                  Choose the clients who will receive invoices for "{selectedFeeStructure?.name}".
                </p>
              </div>

              {/* Client Filters */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter Clients
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Name, ID, email..."
                        value={clientFilters.search}
                        onChange={e =>
                          setClientFilters(prev => ({ ...prev, search: e.target.value }))
                        }
                        className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={clientFilters.status}
                      onChange={e =>
                        setClientFilters(prev => ({ ...prev, status: e.target.value as any }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
                    <select
                      value={clientFilters.usage_context}
                      onChange={e =>
                        setClientFilters(prev => ({ ...prev, usage_context: e.target.value }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">All Contexts</option>
                      <option value="client">Client</option>
                      <option value="customer">Customer</option>
                      <option value="patient">Patient</option>
                      <option value="financial">Financial</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                      value={clientFilters.classification || ''}
                      onChange={e =>
                        setClientFilters(prev => ({
                          ...prev,
                          classification: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">All Classes</option>
                      {classifications.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Selection Actions */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {selectedClients.length} of {clients.length} clients selected
                </div>
                <div className="space-x-2">
                  <button
                    onClick={handleSelectAllClients}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Select All
                  </button>
                  <button
                    onClick={async () => {
                      // Select all clients matching current classification (fetch full set)
                      if (!clientFilters.classification) return;
                      try {
                        setIsLoading(true);
                        const resp = await clientService.getClients({
                          classification: clientFilters.classification,
                          status: clientFilters.status,
                          ordering: 'full_name',
                        });
                        const ids = (resp.results || []).map((c: Client) => c.id);
                        setSelectedClients(ids);
                        setFormData(prev => ({ ...prev, clients: ids }));
                      } catch (e) {
                        console.error('Failed to select class clients', e);
                        showError('Failed to select class');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Select Class
                  </button>
                  <button
                    onClick={handleDeselectAllClients}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Client List */}
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600">Loading clients...</span>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                  {clients.map(client => (
                    <div
                      key={client.id}
                      className="flex items-center p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => handleClientToggle(client.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">{client.full_name}</div>
                        <div className="text-sm text-gray-500">
                          ID: {client.client_id} | {client.usage_context} | {client.status}
                        </div>
                        {client.email && (
                          <div className="text-xs text-gray-400">{client.email}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-600">
                          {formatCurrency(selectedFeeStructure?.base_amount || '0')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {clients.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <div className="text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Clients Found</h3>
                    <p className="text-gray-600">
                      Try adjusting your filters or add some clients first.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview & Confirmation */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview & Confirm</h3>
                <p className="text-gray-600 mb-4">
                  Review the invoices that will be created and configure additional options.
                </p>
              </div>

              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-blue-600 font-medium">Fee Structure</div>
                    <div className="text-blue-900">{selectedFeeStructure?.name}</div>
                  </div>
                  <div>
                    <div className="text-blue-600 font-medium">Clients</div>
                    <div className="text-blue-900">{selectedClients.length}</div>
                  </div>
                  <div>
                    <div className="text-blue-600 font-medium">Amount Each</div>
                    <div className="text-blue-900">
                      {formatCurrency(selectedFeeStructure?.base_amount || '0')}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-600 font-medium">Total Amount</div>
                    <div className="text-blue-900 font-bold">
                      {formatCurrency(
                        (
                          parseFloat(selectedFeeStructure?.base_amount || '0') *
                          selectedClients.length
                        ).toString()
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Options */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-4">Invoice Options</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={formData.invoice_date}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, invoice_date: e.target.value }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={e => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Additional description for the invoices..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>

                <div className="mt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.send_immediately}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, send_immediately: e.target.checked }))
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-900">
                      Send invoices immediately after creation
                    </span>
                  </label>
                </div>
              </div>

              {/* Invoice Preview List */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900">
                    Invoice Preview ({invoicePreview.length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {invoicePreview.map((preview, index) => (
                    <div
                      key={preview.client_id}
                      className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center">
                        {preview.status === 'ready' ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {preview.client_name}
                          </div>
                          {preview.error_message && (
                            <div className="text-xs text-red-600">{preview.error_message}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency(preview.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {currentStep === 4 && bulkResult && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk Invoice Results</h3>
                <p className="text-gray-600 mb-4">
                  Here are the results of your bulk invoice generation.
                </p>
              </div>

              {/* Results Summary */}
              <div
                className={`border rounded-lg p-4 ${
                  bulkResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center mb-3">
                  {bulkResult.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600 mr-2" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
                  )}
                  <h4
                    className={`font-medium ${
                      bulkResult.success ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {bulkResult.success
                      ? 'Bulk Invoice Generation Completed'
                      : 'Bulk Invoice Generation Failed'}
                  </h4>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div
                      className={`font-medium ${bulkResult.success ? 'text-green-600' : 'text-red-600'}`}
                    >
                      Created Successfully
                    </div>
                    <div
                      className={`text-lg font-bold ${bulkResult.success ? 'text-green-900' : 'text-red-900'}`}
                    >
                      {bulkResult.created_count}
                    </div>
                  </div>
                  <div>
                    <div
                      className={`font-medium ${bulkResult.success ? 'text-green-600' : 'text-red-600'}`}
                    >
                      Failed
                    </div>
                    <div
                      className={`text-lg font-bold ${bulkResult.success ? 'text-green-900' : 'text-red-900'}`}
                    >
                      {bulkResult.failed_count}
                    </div>
                  </div>
                  <div>
                    <div
                      className={`font-medium ${bulkResult.success ? 'text-green-600' : 'text-red-600'}`}
                    >
                      Total Amount
                    </div>
                    <div
                      className={`text-lg font-bold ${bulkResult.success ? 'text-green-900' : 'text-red-900'}`}
                    >
                      {bulkResult.total_amount
                        ? formatCurrency(bulkResult.total_amount)
                        : formatCurrency(
                            (bulkResult.created_invoices || bulkResult.invoices || [])
                              .reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
                              .toString()
                          )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice List */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900">
                    Created Invoices (
                    {(bulkResult.created_invoices || bulkResult.invoices || []).length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(bulkResult.created_invoices || bulkResult.invoices || []).map(invoice => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center">
                        {invoice.status === 'failed' ? (
                          <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
                        ) : invoice.status === 'sent' ? (
                          <Send className="w-4 h-4 text-blue-500 mr-2" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.invoice_number} - {invoice.client_name}
                          </div>
                          <div className="text-xs text-gray-500">Status: {invoice.status}</div>
                          {invoice.error && (
                            <div className="text-xs text-red-600">{invoice.error}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency(invoice.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Errors */}
              {(bulkResult.errors || []).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-2">Errors</h4>
                  <ul className="text-sm text-red-800 space-y-1">
                    {(bulkResult.errors || []).map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center space-x-4">
            {currentStep > 1 && currentStep < 4 && (
              <button
                onClick={prevStep}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </button>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {currentStep < 3 && (
              <button
                onClick={nextStep}
                disabled={
                  (currentStep === 1 && !selectedFeeStructure) ||
                  (currentStep === 2 && selectedClients.length === 0)
                }
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Invoices...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Create {selectedClients.length} Invoices
                  </>
                )}
              </button>
            )}

            {currentStep === 4 && (
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    if (bulkResult) {
                      navigate('/bulk-invoice-results', { state: { result: bulkResult } });
                      handleClose();
                    }
                  }}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Results
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkInvoiceWizard;
