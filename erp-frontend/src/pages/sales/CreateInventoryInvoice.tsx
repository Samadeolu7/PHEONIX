// src/pages/sales/CreateInventoryInvoice.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { inventoryService } from '../../services/inventoryService';
import { clientService, ClientOption } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Plus, Trash2, AlertCircle, Save } from 'lucide-react';

interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  unit_price: string;
  quantity_available: number;
}

interface InvoiceLineItem {
  item_id: number;
  item_name?: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  line_total?: string;
}

interface FormData {
  client: number;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  notes: string;
  discount_amount: string;
  items: InvoiceLineItem[];
}

interface FormErrors {
  client?: string;
  invoice_date?: string;
  due_date?: string;
  items?: string;
  [key: string]: any;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const CreateInventoryInvoice: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    client: 0,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    payment_terms: 'Net 30',
    notes: '',
    discount_amount: '0.00',
    items: [
      {
        item_id: 0,
        quantity: '1',
        unit_price: '0.00',
        discount_amount: '0.00',
        tax_amount: '0.00',
      },
    ],
  });

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
    loadInventoryItems();
    calculateDueDate();
  }, []);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  };

  const loadInventoryItems = async () => {
    try {
      setLoadingItems(true);
      const items = await inventoryService.getAllItems({ is_active: true });
      setInventoryItems(items);
    } catch (error) {
      console.error('Error loading inventory items:', error);
      showError('Failed to load inventory items');
    } finally {
      setLoadingItems(false);
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

  const handleInputChange = (field: keyof FormData, value: any) => {
    if (field === 'discount_amount' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));

    if (field in errors) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

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

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    if (
      typeof value === 'string' &&
      (field === 'unit_price' || field === 'discount_amount' || field === 'tax_amount') &&
      !isValidDecimalInput(value)
    ) {
      return;
    }

    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-populate unit price when item is selected
    if (field === 'item_id' && value) {
      const selectedItem = inventoryItems.find(item => item.id === parseInt(value));
      if (selectedItem) {
        newItems[index].unit_price = selectedItem.unit_price;
        newItems[index].item_name = selectedItem.name;
      }
    }

    // Calculate line total
    const quantity = parseFloat(newItems[index].quantity || '0');
    const unitPrice = parseFloat(newItems[index].unit_price || '0');
    const discount = parseFloat(newItems[index].discount_amount || '0');
    const tax = parseFloat(newItems[index].tax_amount || '0');
    newItems[index].line_total = (quantity * unitPrice - discount + tax).toFixed(2);

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_id: 0,
          quantity: '1',
          unit_price: '0.00',
          discount_amount: '0.00',
          tax_amount: '0.00',
        },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    if (formData.items.length === 1) {
      showError('Invoice must have at least one item');
      return;
    }
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity || '0');
      const unitPrice = parseFloat(item.unit_price || '0');
      return sum + quantity * unitPrice;
    }, 0);

    const totalDiscount =
      formData.items.reduce((sum, item) => {
        return sum + parseFloat(item.discount_amount || '0');
      }, 0) + parseFloat(formData.discount_amount || '0');

    const totalTax = formData.items.reduce((sum, item) => {
      return sum + parseFloat(item.tax_amount || '0');
    }, 0);

    const total = subtotal - totalDiscount + totalTax;

    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      totalTax: totalTax.toFixed(2),
      total: total.toFixed(2),
    };
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

    if (formData.items.length === 0) {
      newErrors.items = 'Invoice must have at least one item';
    } else {
      formData.items.forEach((item, idx) => {
        if (!item.item_id) {
          newErrors[`items.${idx}.item_id`] = 'Please select an item';
        }
        if (!item.quantity || parseFloat(item.quantity) <= 0) {
          newErrors[`items.${idx}.quantity`] = 'Quantity must be greater than 0';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showError('Please fix the validation errors');
      return;
    }

    try {
      setSubmitting(true);

      const invoiceData = {
        client: formData.client,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        payment_terms: formData.payment_terms,
        notes: formData.notes,
        discount_amount: formData.discount_amount,
        items: formData.items.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount || '0.00',
          tax_amount: item.tax_amount || '0.00',
        })),
      };

      const createdInvoice = await api.post('/inventory/invoices/', invoiceData);

      success(`Invoice ${createdInvoice.invoice_number} created successfully`);
      navigate('/sales/invoices');
    } catch (error: any) {
      console.error('Error creating invoice:', error);

      // Handle DRF validation errors
      if (error.response?.data) {
        const apiErrors = error.response.data;
        const formattedErrors: FormErrors = {};

        Object.keys(apiErrors).forEach(key => {
          if (Array.isArray(apiErrors[key])) {
            formattedErrors[key] = apiErrors[key][0];
          } else if (typeof apiErrors[key] === 'string') {
            formattedErrors[key] = apiErrors[key];
          }
        });

        if (Object.keys(formattedErrors).length > 0) {
          setErrors(formattedErrors);
          showError('Please fix the validation errors');
        } else {
          showError(error.response?.data?.detail || 'Failed to create invoice');
        }
      } else {
        showError('Failed to create invoice');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6 p-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Create Inventory Invoice</h1>
        <p className="text-gray-600">Create an invoice with line items for products/inventory</p>
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
                  errors.client ? 'border-red-300' : 'border-gray-300'
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
              {errors.client && (
                <div className="mt-1 flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.client}
                </div>
              )}
            </div>

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

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
              <input
                type="text"
                value={formData.payment_terms}
                onChange={e => handleInputChange('payment_terms', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="e.g., Net 30, Due on receipt"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Invoice Items</h3>
            <button
              type="button"
              onClick={addLineItem}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {formData.items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 relative">
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={item.item_id}
                      onChange={e =>
                        handleLineItemChange(index, 'item_id', parseInt(e.target.value))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      disabled={loadingItems}
                    >
                      <option value={0}>Select item...</option>
                      {inventoryItems.map(invItem => (
                        <option key={invItem.id} value={invItem.id}>
                          {invItem.name} (SKU: {invItem.sku})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={item.quantity}
                      onChange={e => handleLineItemChange(index, 'quantity', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Price
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.unit_price}
                      onChange={e => handleLineItemChange(index, 'unit_price', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.discount_amount}
                      onChange={e => handleLineItemChange(index, 'discount_amount', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Line Total
                    </label>
                    <input
                      type="text"
                      value={item.line_total || '0.00'}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50"
                      disabled
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invoice Totals */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">₦{totals.subtotal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Discount:</span>
              <span className="font-medium">-₦{totals.totalDiscount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax:</span>
              <span className="font-medium">₦{totals.totalTax}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-semibold">Total:</span>
              <span className="font-bold text-lg">₦{totals.total}</span>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Additional notes or instructions..."
            />
          </div>
        </div>

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
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Invoice
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateInventoryInvoice;
