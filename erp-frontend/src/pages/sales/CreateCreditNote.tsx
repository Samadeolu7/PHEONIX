// src/pages/sales/CreateCreditNote.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoiceService, Invoice, CreateCreditNoteData } from '../../services/invoiceService';
import { inventoryService } from '../../services/inventoryService';
import { InventoryItem } from '../../types/inventory';
import { useToast } from '../../hooks/useToast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Calculator,
  CreditCard,
  Save,
  FileText,
} from 'lucide-react';

interface CreditNoteItem {
  id?: string; // Temporary ID for form management
  item?: number;
  item_name: string;
  item_sku: string;
  description: string;
  quantity_returned: string;
  original_quantity: string;
  unit_price: string;
  discount: string;
  tax_amount: string;
  line_total: string;
  return_reason?:
    | 'defective'
    | 'wrong_item'
    | 'damaged'
    | 'not_as_described'
    | 'customer_request'
    | 'pricing_error'
    | 'other';
  return_notes?: string;
  return_to_stock: boolean;
}

interface CreditNoteFormData {
  reason: string;
  notes: string;
  subtotal: string;
  discount: string;
  tax_amount: string;
  total_amount: string;
  status: 'draft' | 'issued' | 'applied' | 'cancelled';
  items: CreditNoteItem[];
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const CreateCreditNote: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [showItemSearch, setShowItemSearch] = useState(false);
  const { success, error: showError } = useToast();

  const [formData, setFormData] = useState<CreditNoteFormData>({
    reason: '',
    notes: '',
    subtotal: '0.00',
    discount: '0.00',
    tax_amount: '0.00',
    total_amount: '0.00',
    status: 'draft',
    items: [],
  });

  useEffect(() => {
    if (invoiceId) {
      loadInvoice();
      loadInventoryItems();
    }
  }, [invoiceId]);

  useEffect(() => {
    calculateTotals();
  }, [formData.items, formData.discount]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const invoiceData = await invoiceService.getInvoice(Number(invoiceId));
      setInvoice(invoiceData);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showError('Failed to load invoice');
      navigate('/sales/invoices');
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryItems = async () => {
    try {
      const response = await inventoryService.getItems({ search: itemSearchQuery });
      setInventoryItems(response.results || []);
    } catch (error) {
      console.error('Error loading inventory items:', error);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (itemSearchQuery) {
        loadInventoryItems();
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [itemSearchQuery]);

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => {
      const lineSubtotal = parseFloat(item.line_total || '0') - parseFloat(item.tax_amount || '0');
      return sum + lineSubtotal;
    }, 0);

    const totalTax = formData.items.reduce((sum, item) => {
      return sum + parseFloat(item.tax_amount || '0');
    }, 0);

    const discountPercentage = parseFloat(formData.discount || '0');
    const discountAmount = (subtotal * discountPercentage) / 100;
    const totalAmount = subtotal + totalTax - discountAmount;

    setFormData(prev => ({
      ...prev,
      subtotal: subtotal.toFixed(2),
      tax_amount: totalTax.toFixed(2),
      total_amount: totalAmount.toFixed(2),
    }));
  };

  const handleInputChange = (field: keyof CreditNoteFormData, value: string) => {
    if ((field === 'discount' || field === 'tax_amount' || field === 'total_amount') && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const addItem = (inventoryItem: InventoryItem) => {
    const newItem: CreditNoteItem = {
      id: `temp-${Date.now()}`,
      item: inventoryItem.id,
      item_name: inventoryItem.name,
      item_sku: inventoryItem.sku,
      description: inventoryItem.name, // Use item name as description
      quantity_returned: '1.00',
      original_quantity: '1.00', // Default to same as returned quantity
      unit_price: inventoryItem.selling_price,
      discount: '0.00',
      tax_amount: '0.00',
      line_total: inventoryItem.selling_price,
      return_reason: undefined,
      return_notes: undefined,
      return_to_stock: false,
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    setShowItemSearch(false);
    setItemSearchQuery('');
  };

  const updateItem = (itemId: string, field: keyof CreditNoteItem, value: string | boolean) => {
    if (
      typeof value === 'string' &&
      (field === 'unit_price' || field === 'line_total' || field === 'discount' || field === 'tax_amount') &&
      !isValidDecimalInput(value)
    ) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };

          // Recalculate line total when quantity_returned or unit_price changes
          if (field === 'quantity_returned' || field === 'unit_price') {
            const quantity = parseFloat(
              field === 'quantity_returned' ? (value as string) : updatedItem.quantity_returned
            );
            const unitPrice = parseFloat(
              field === 'unit_price' ? (value as string) : updatedItem.unit_price
            );
            const discount = parseFloat(updatedItem.discount || '0');

            const lineSubtotal = quantity * unitPrice - discount;
            const lineTax = lineSubtotal * 0.18; // 18% tax
            updatedItem.tax_amount = lineTax.toFixed(2);
            updatedItem.line_total = (lineSubtotal + lineTax).toFixed(2);
          }

          return updatedItem;
        }
        return item;
      }),
    }));
  };

  const removeItem = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoice) return;

    // Validation
    if (!formData.reason.trim()) {
      showError('Please provide a reason for the credit note');
      return;
    }

    if (formData.items.length === 0) {
      showError('Please add at least one item to the credit note');
      return;
    }

    try {
      setSaving(true);

      const creditNoteData: CreateCreditNoteData = {
        client: invoice.client,
        issue_date: new Date().toISOString().split('T')[0],
        reason: formData.reason,
        notes: formData.notes || undefined,
        subtotal: formData.subtotal,
        discount: formData.discount,
        tax_amount: formData.tax_amount,
        total_amount: formData.total_amount,
        status: formData.status,
        items: formData.items.map(item => ({
          item: item.item,
          description: item.description,
          quantity_returned: item.quantity_returned,
          original_quantity: item.original_quantity,
          unit_price: item.unit_price || '0.00',
          discount: item.discount || '0.00',
          tax_amount: item.tax_amount || '0.00',
          line_total: item.line_total,
          return_reason: item.return_reason,
          return_notes: item.return_notes,
          return_to_stock: item.return_to_stock || false,
        })),
      };

      await invoiceService.createCreditNote(invoice.id, creditNoteData);
      success('Credit note created successfully');
      navigate(`/sales/invoices/${invoiceId}/credit-notes`);
    } catch (error) {
      console.error('Error creating credit note:', error);
      showError('Failed to create credit note');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  if (loading || !invoice) {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes`)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Credit Note</h1>
              <p className="text-gray-600">
                Create credit note for Invoice {invoice.invoice_number} • {invoice.client_name}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-gray-500">
              Invoice Amount: {formatCurrency(invoice.amount)}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Credit Note Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Credit Note *
              </label>
              <input
                type="text"
                value={formData.reason}
                onChange={e => handleInputChange('reason', e.target.value)}
                placeholder="e.g., Product return, Pricing error, Discount..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={formData.status}
                onChange={e => handleInputChange('status', e.target.value as any)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes or comments..."
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Items Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Credit Note Items</h3>
            <button
              type="button"
              onClick={() => setShowItemSearch(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </button>
          </div>

          {/* Item Search Modal */}
          {showItemSearch && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-medium text-gray-900">Select Item</h4>
                  <button
                    type="button"
                    onClick={() => setShowItemSearch(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={itemSearchQuery}
                      onChange={e => setItemSearchQuery(e.target.value)}
                      placeholder="Search items by name or SKU..."
                      className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {inventoryItems.length > 0 ? (
                    <div className="space-y-2">
                      {inventoryItems.map(item => (
                        <div
                          key={item.id}
                          onClick={() => addItem(item)}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
                        >
                          <div>
                            <div className="font-medium text-gray-900">{item.name}</div>
                            <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900">
                              {formatCurrency(item.selling_price)}
                            </div>
                            <div className="text-sm text-gray-500">{item.unit_of_measure}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {itemSearchQuery ? 'No items found' : 'Start typing to search for items'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Items Table */}
          {formData.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Qty Returned
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Original Qty
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Line Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formData.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{item.item_name}</div>
                          <div className="text-sm text-gray-500">SKU: {item.item_sku}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateItem(item.id!, 'description', e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          placeholder="Item description..."
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          value={item.quantity_returned}
                          onChange={e => updateItem(item.id!, 'quantity_returned', e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          value={item.original_quantity}
                          onChange={e => updateItem(item.id!, 'original_quantity', e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.line_total}
                          onChange={e => updateItem(item.id!, 'line_total', e.target.value)}
                          className="w-24 border border-gray-300 rounded-md px-2 py-1 text-sm"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id!)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No items added</h3>
              <p className="mt-1 text-sm text-gray-500">
                Add items to include in this credit note.
              </p>
            </div>
          )}
        </div>

        {/* Totals Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Totals
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Percentage (%)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.discount}
                  onChange={e => {
                    const nextValue = e.target.value;
                    if (!isValidDecimalInput(nextValue)) {
                      return;
                    }
                    const value = parseFloat(nextValue) || 0;
                    if (value <= 100) {
                      handleInputChange('discount', e.target.value);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="text-gray-500 text-sm">%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Maximum 100%</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(formData.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Discount ({formData.discount}%):</span>
                <span className="font-medium">
                  -
                  {formatCurrency(
                    (
                      (parseFloat(formData.subtotal) * parseFloat(formData.discount || '0')) /
                      100
                    ).toFixed(2)
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Tax (18%):</span>
                <span className="font-medium">{formatCurrency(formData.tax_amount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium text-gray-900">Total Amount:</span>
                <span className="font-bold text-lg text-gray-900">
                  {formatCurrency(formData.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes`)}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || formData.items.length === 0}
            className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Creating...' : 'Create Credit Note'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateCreditNote;
