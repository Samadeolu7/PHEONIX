// src/pages/sales/CreateInvoice.tsx
import React, { useState, useEffect } from 'react';
import { invoiceService, CreateInvoiceData } from '../../services/invoiceService';
import { clientService, ClientOption } from '../../services/clientService';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Send, Save, AlertCircle, CheckCircle } from 'lucide-react';

interface InvoiceFormData {
  client: number;
  invoice_date: string;
  due_date: string;
  description: string;
  amount: string;
  fee_structure: number | null;
  create_entitlement: boolean;
  entitlement_config: {
    payment_term_type: 'full_upfront' | 'minimum_deposit' | 'installments' | 'prepaid_allocation';
    minimum_required: string;
    valid_until: string;
  };
  status: 'draft' | 'sent';
}

interface FormErrors {
  client?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  amount?: string;
  fee_structure?: string;
  entitlement_config?: string;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const CreateInvoice: React.FC = () => {
  const [formData, setFormData] = useState<InvoiceFormData>({
    client: 0,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    description: '',
    amount: '',
    fee_structure: null,
    create_entitlement: false,
    entitlement_config: {
      payment_term_type: 'minimum_deposit',
      minimum_required: '0',
      valid_until: '',
    },
    status: 'draft',
  });

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [feeStructures, setFeeStructures] = useState<Array<{ id: number; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingFeeStructures, setLoadingFeeStructures] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
    loadFeeStructures();
    calculateDueDate();
  }, []);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      // Load clients using the client service
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  };

  const loadFeeStructures = async () => {
    try {
      setLoadingFeeStructures(true);
      const response = await api.get('/incomes/fee-structures/', { params: { is_active: true } });
      setFeeStructures(response.results || response);
    } catch (error) {
      console.error('Error loading fee structures:', error);
      // Not critical, user can still create invoice without fee structure
    } finally {
      setLoadingFeeStructures(false);
    }
  };

  const calculateDueDate = () => {
    // Default to 30 days from invoice date
    const invoiceDate = new Date(formData.invoice_date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    setFormData(prev => ({
      ...prev,
      due_date: dueDate.toISOString().split('T')[0],
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.client) {
      newErrors.client = 'Please select a client';
    }

    if (!formData.invoice_date) {
      newErrors.invoice_date = 'Invoice date is required';
    }

    if (!formData.due_date) {
      newErrors.due_date = 'Due date is required';
    } else if (new Date(formData.due_date) <= new Date(formData.invoice_date)) {
      newErrors.due_date = 'Due date must be after invoice date';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof InvoiceFormData, value: any) => {
    if (field === 'amount' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field when user starts typing (only for fields that can have errors)
    if (field in errors && errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field as keyof FormErrors]: undefined }));
    }

    // Auto-calculate due date when invoice date changes
    if (field === 'invoice_date') {
      const invoiceDate = new Date(value);
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);
      setFormData(prev => ({
        ...prev,
        due_date: dueDate.toISOString().split('T')[0],
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate form before submission
    if (!validateForm()) {
      showError('Please fix the validation errors');
      return;
    }

    try {
      setSubmitting(true);

      // Backend auto-generates invoice_number, so we don't send it
      const invoiceData: CreateInvoiceData = {
        client: formData.client,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        description: formData.description,
        amount: formData.amount,
        fee_structure: formData.fee_structure || undefined,
        metadata: formData.create_entitlement
          ? {
              create_entitlement: true,
              entitlement_config: formData.entitlement_config,
            }
          : {},
      };

      const createdInvoice = await invoiceService.createInvoice(invoiceData);

      success(`Invoice ${createdInvoice.invoice_number} created successfully`);

      // Navigate to invoice list
      navigate('/sales/invoices');
    } catch (error: any) {
      console.error('Error creating invoice:', error);

      // Handle DRF validation errors: {field: ['error message']}
      if (error.response?.data) {
        const apiErrors = error.response.data;
        const formattedErrors: FormErrors = {};

        // Convert DRF array format to single string
        Object.keys(apiErrors).forEach(key => {
          if (Array.isArray(apiErrors[key])) {
            formattedErrors[key as keyof FormErrors] = apiErrors[key][0];
          } else if (typeof apiErrors[key] === 'string') {
            formattedErrors[key as keyof FormErrors] = apiErrors[key];
          }
        });

        if (Object.keys(formattedErrors).length > 0) {
          setErrors(formattedErrors);
          showError('Please fix the validation errors');
        } else {
          showError(
            error.response?.data?.detail ||
              error.response?.data?.message ||
              'Failed to create invoice'
          );
        }
      } else {
        showError('Failed to create invoice');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getSelectedClient = () => {
    return clients.find(c => c.id === formData.client);
  };

  const getFieldError = (field: keyof FormErrors) => {
    return errors[field];
  };

  const hasFieldError = (field: keyof FormErrors) => {
    return !!errors[field];
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Create Sales Invoice</h1>
        <p className="text-gray-600">Create a new sales invoice for a customer</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.client}
                onChange={e => handleInputChange('client', parseInt(e.target.value))}
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('client')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                disabled={loadingClients}
                required
              >
                <option value={0}>
                  {loadingClients ? 'Loading clients...' : 'Select a client...'}
                </option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.client_id})
                  </option>
                ))}
              </select>
              {hasFieldError('client') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('client')}
                </div>
              )}
              {loadingClients && (
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Loading clients...
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={e => handleInputChange('status', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="sent">Send Immediately</option>
              </select>
            </div>

            {/* Fee Structure (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fee Structure <span className="text-gray-400 text-xs">(Optional)</span>
              </label>
              <select
                value={formData.fee_structure || ''}
                onChange={e =>
                  handleInputChange(
                    'fee_structure',
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('fee_structure')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                disabled={loadingFeeStructures}
              >
                <option value="">
                  {loadingFeeStructures ? 'Loading fee structures...' : 'None (Ad-hoc invoice)'}
                </option>
                {feeStructures.map(fs => (
                  <option key={fs.id} value={fs.id}>
                    {fs.name}
                  </option>
                ))}
              </select>
              {hasFieldError('fee_structure') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('fee_structure')}
                </div>
              )}
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={e => handleInputChange('invoice_date', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('invoice_date')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                required
              />
              {hasFieldError('invoice_date') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('invoice_date')}
                </div>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={e => handleInputChange('due_date', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('due_date')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                required
              />
              {hasFieldError('due_date') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('due_date')}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (₦) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.amount}
                onChange={e => handleInputChange('amount', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('amount')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                placeholder="0.00"
                required
              />
              {hasFieldError('amount') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('amount')}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                rows={4}
                className={`w-full border rounded-md px-3 py-2 ${
                  hasFieldError('description')
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                placeholder="Describe the goods or services being invoiced..."
                required
              />
              {hasFieldError('description') && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {getFieldError('description')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Entitlement Configuration (Optional - for enrollment-based billing) */}
        {formData.fee_structure && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Create Service Entitlement</h3>
                <p className="text-sm text-gray-600">
                  Link this invoice to service access (enrollment, membership, prepaid services)
                </p>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.create_entitlement}
                  onChange={e => handleInputChange('create_entitlement', e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Enable Entitlement</span>
              </label>
            </div>

            {formData.create_entitlement && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Term Type
                  </label>
                  <select
                    value={formData.entitlement_config.payment_term_type}
                    onChange={e =>
                      handleInputChange('entitlement_config', {
                        ...formData.entitlement_config,
                        payment_term_type: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="minimum_deposit">Minimum Deposit Required</option>
                    <option value="full_upfront">Must Pay in Full</option>
                    <option value="installments">Installment Plan</option>
                    <option value="prepaid_allocation">
                      Prepaid Allocation (meal plans, credits)
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.entitlement_config.payment_term_type === 'minimum_deposit' &&
                      'Client must pay minimum to activate services'}
                    {formData.entitlement_config.payment_term_type === 'full_upfront' &&
                      'Full payment required before service access'}
                    {formData.entitlement_config.payment_term_type === 'installments' &&
                      'Flexible payment plan with defined installments'}
                    {formData.entitlement_config.payment_term_type === 'prepaid_allocation' &&
                      'Prepay for units (meals, credits, sessions)'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Required Payment
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.entitlement_config.minimum_required}
                    onChange={e => {
                      const nextValue = e.target.value;
                      if (!isValidDecimalInput(nextValue)) {
                        return;
                      }

                      handleInputChange('entitlement_config', {
                        ...formData.entitlement_config,
                        minimum_required: nextValue,
                      });
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="0.00"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Amount required to activate entitlement (0 = no minimum)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid Until Date
                  </label>
                  <input
                    type="date"
                    value={formData.entitlement_config.valid_until}
                    onChange={e =>
                      handleInputChange('entitlement_config', {
                        ...formData.entitlement_config,
                        valid_until: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    When does this entitlement expire? (Leave blank for no expiry)
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Entitlement Summary</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Service access will be created when invoice is posted</li>
                    <li>• Access level depends on payment status</li>
                    <li>• Client can access services based on payment terms</li>
                    <li>
                      • Minimum payment: ₦{formData.entitlement_config.minimum_required || '0.00'}
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoice Preview */}
        {formData.client > 0 && formData.amount && formData.description && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Invoice Preview</h3>
              <div className="flex items-center text-sm text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                Preview Ready
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
                  <p className="text-gray-600">Will be auto-generated</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Invoice Date</p>
                  <p className="font-medium">
                    {new Date(formData.invoice_date).toLocaleDateString('en-GB')}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">Due Date</p>
                  <p className="font-medium">
                    {new Date(formData.due_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Bill To:</h3>
                <p className="text-gray-900 font-medium">{getSelectedClient()?.name}</p>
                <p className="text-sm text-gray-600">{getSelectedClient()?.client_id}</p>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Description:</span>
                </div>
                <p className="text-gray-900 mb-4">{formData.description}</p>

                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total Amount:</span>
                  <span>
                    ₦
                    {new Intl.NumberFormat('en-NG', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(parseFloat(formData.amount) || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center space-x-2"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : formData.status === 'sent' ? (
              <>
                <Send className="w-4 h-4" />
                <span>Create & Send</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Create Invoice</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateInvoice;
