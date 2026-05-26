// src/pages/sales/InvoiceForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoiceService, Invoice, CreateInvoiceData } from '../../services/invoiceService';
import { clientService, ClientOption } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';
import { ArrowLeft, Save } from 'lucide-react';

interface InvoiceFormData {
  client: number;
  // invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string;
  amount: string;
  status: 'draft' | 'sent';
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const InvoiceForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const [formData, setFormData] = useState<InvoiceFormData>({
    client: 0,
    // invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    description: '',
    amount: '',
    status: 'draft',
  });

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [originalData, setOriginalData] = useState<InvoiceFormData | null>(null);
  const { success, error: showError } = useToast();

  useEffect(() => {
    loadClients();
    if (isEditMode && id) {
      loadInvoice();
    } else {
      calculateDueDate();
    }
  }, [id, isEditMode]);

  const loadClients = async () => {
    try {
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    }
  };

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const invoice = await invoiceService.getInvoice(Number(id));
      const invoiceFormData: InvoiceFormData = {
        client: invoice.client,
        // invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        description: invoice.description,
        amount: invoice.amount,
        status: invoice.status,
      };
      setFormData(invoiceFormData);
      setOriginalData(invoiceFormData);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showError('Failed to load invoice');
      navigate('/sales/invoices');
    } finally {
      setLoading(false);
    }
  };

  const calculateDueDate = () => {
    const invoiceDate = new Date(formData.invoice_date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    setFormData(prev => ({
      ...prev,
      due_date: dueDate.toISOString().split('T')[0],
    }));
  };

  const handleInputChange = (field: keyof InvoiceFormData, value: any) => {
    if (field === 'amount' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));

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

  const hasChanges = () => {
    if (!isEditMode) return true;
    if (!originalData) return false;

    return Object.keys(formData).some(key => {
      return formData[key as keyof InvoiceFormData] !== originalData[key as keyof InvoiceFormData];
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.client || !formData.amount || !formData.description) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      const invoiceData: CreateInvoiceData = {
        client: formData.client,
        // invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        description: formData.description,
        amount: formData.amount,
        status: formData.status,
      };

      if (isEditMode && id) {
        await invoiceService.updateInvoice(Number(id), invoiceData);
        success('Invoice updated successfully');
      } else {
        await invoiceService.createInvoice(invoiceData);
        success('Invoice created successfully');
      }

      navigate('/sales/invoices');
    } catch (error) {
      console.error('Error saving invoice:', error);
      showError('Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const getSelectedClient = () => {
    return clients.find(c => c.id === formData.client);
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount) || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/sales/invoices')}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Edit Invoice' : 'Create Invoice'}
            </h1>
            <p className="text-gray-600">
              {isEditMode
                ? 'Update invoice information'
                : 'Create a new sales invoice for a customer'}
            </p>
          </div>
        </div>
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
                disabled={isEditMode} // Don't allow changing client in edit mode
              >
                <option value={0}>Select a client...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Number */}
            {/* <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => handleInputChange('invoice_number', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              />
            </div> */}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={e => handleInputChange('status', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="draft">Draft</option>
                <option value="sent">Send Immediately</option>
              </select>
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              />
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              />
            </div>

            {/* Amount */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (?) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.amount}
                onChange={e => handleInputChange('amount', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="0.00"
                required
              />
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Describe the goods or services being invoiced..."
                required
              />
            </div>
          </div>
        </div>

        {/* Invoice Preview */}
        {formData.client > 0 && formData.amount && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Preview</h3>

            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
                  {/* <p className="text-gray-600">{formData.invoice_number}</p> */}
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
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Description:</span>
                </div>
                <p className="text-gray-900 mb-4">{formData.description}</p>

                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(formData.amount)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/sales/invoices')}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !formData.client ||
              !formData.amount ||
              !formData.description ||
              (isEditMode && !hasChanges())
            }
            className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Saving...' : isEditMode ? 'Update Invoice' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InvoiceForm;
