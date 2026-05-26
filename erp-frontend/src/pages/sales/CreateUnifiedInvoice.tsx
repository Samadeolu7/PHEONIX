// src/pages/sales/CreateUnifiedInvoice.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { invoiceService, CreateInvoiceData, InvoiceItem } from '../../services/invoiceService';
import { clientService, ClientOption } from '../../services/clientService';
import { serviceItemService } from '../../services/serviceItemService';
import { api } from '../../services/api';
import { inventoryService } from '../../services/inventoryService';
import CreateServiceItemModal, {
  CreatedServiceItem,
} from '../../components/incomes/CreateServiceItemModal';

interface ServiceItem {
  id: number;
  name: string;
  code: string;
  default_price: string;
  creates_entitlement: boolean;
  description: string;
  is_active: boolean;
}

interface FeeStructureComponent {
  id: number;
  component_type: 'service' | 'inventory';
  service_item: number | null;
  service_item_name: string | null;
  inventory_item: number | null;
  inventory_item_name: string | null;
  quantity: string;
  unit_price: string;
  effective_unit_price: string;
  line_total: string;
  is_mandatory: boolean;
  order: number;
}

interface FeeStructure {
  id: number;
  name: string;
  base_amount: string;
  computed_total: string;
  code: string;
  components: FeeStructureComponent[];
}

interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  selling_price: string;
  total_available: number;
}

interface FormData {
  client: number;
  invoice_date: string;
  due_date: string;
  description: string;
  notes: string;
  discount_amount: string;
  fee_structure?: number | null;
  status: 'draft' | 'sent';
  items: InvoiceItem[];
}

interface FormErrors {
  client?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  items?: string;
  [key: string]: any;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const CreateUnifiedInvoice: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  // Get clientId from URL query params
  const queryParams = new URLSearchParams(location.search);
  const preselectedClientId = queryParams.get('clientId');

  const [formData, setFormData] = useState<FormData>({
    client: preselectedClientId ? parseInt(preselectedClientId) : 0,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    description: '',
    notes: '',
    discount_amount: '0.00',
    fee_structure: null,
    status: 'draft',
    items: [
      {
        item_type: 'service',
        description: '',
        quantity: '1',
        unit_price: '0.00',
        line_total: '0.00',
      },
    ],
  });

  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState<string>('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingFeeStructures, setLoadingFeeStructures] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingFeeStructureDetails, setLoadingFeeStructureDetails] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [preselectedClientName, setPreselectedClientName] = useState<string>('');
  const [showCreateServiceModal, setShowCreateServiceModal] = useState(false);
  const [createServiceForItemIndex, setCreateServiceForItemIndex] = useState<number | null>(null);
  const { success, error: showError } = useToast();

  useEffect(() => {
    loadClients();
    loadFeeStructures();
    loadInventoryItems();
    loadServiceItems();

    if (isEditMode && id) {
      loadInvoice(parseInt(id));
    } else {
      calculateDueDate();
    }
  }, [id, isEditMode]);

  // Fetch preselected client details
  useEffect(() => {
    if (preselectedClientId && !isEditMode) {
      const fetchPreselectedClient = async () => {
        try {
          const clientData = await clientService.getClient(parseInt(preselectedClientId));
          setPreselectedClientName(
            clientData.full_name || `${clientData.first_name} ${clientData.last_name}`
          );

          // Auto-fill description with student name
          setFormData(prev => ({
            ...prev,
            description: `Invoice for ${clientData.full_name || `${clientData.first_name} ${clientData.last_name}`}`,
          }));
        } catch (error) {
          console.error('Error fetching preselected client:', error);
        }
      };

      fetchPreselectedClient();
    }
  }, [preselectedClientId, isEditMode]);

  const loadInvoice = async (invoiceId: number) => {
    try {
      setLoading(true);
      const invoice = await invoiceService.getInvoice(invoiceId);

      setOriginalInvoiceNumber(invoice.invoice_number);

      // Map the invoice data to form format
      setFormData({
        client: invoice.client,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        description: invoice.description || '',
        notes: invoice.notes || '',
        discount_amount: invoice.discount_amount || '0.00',
        fee_structure: invoice.fee_structure || null,
        status: invoice.status,
        items: invoice.items.map((item: any) => ({
          id: item.id,
          item_type: item.item_type,
          service_item: item.service_item,
          inventory_item: item.inventory_item,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          metadata: item.metadata,
        })),
      });
    } catch (error) {
      console.error('Error loading invoice:', error);
      showError('Failed to load invoice');
      navigate('/sales/invoices');
    } finally {
      setLoading(false);
    }
  };

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

  const loadFeeStructures = async () => {
    try {
      setLoadingFeeStructures(true);
      const response = await api.get('/incomes/fee-structures/', { params: { is_active: true } });
      setFeeStructures(response.results || response);
    } catch (error) {
      console.error('Error loading fee structures:', error);
    } finally {
      setLoadingFeeStructures(false);
    }
  };

  const loadInventoryItems = async () => {
    try {
      setLoadingInventory(true);
      const items = await inventoryService.getAllItems({ is_active: true });
      // Map the API response to your interface
      const mappedItems = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        selling_price: item.selling_price,
        total_available: parseFloat(item.total_available) || 0,
      }));
      setInventoryItems(mappedItems);
    } catch (error) {
      console.error('Error loading inventory items:', error);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadServiceItems = async () => {
    try {
      setLoadingServices(true);
      const response = await serviceItemService.getServiceItems({ is_active: true });
      setServiceItems(response.results || []);
    } catch (error) {
      console.error('Error loading service items:', error);
    } finally {
      setLoadingServices(false);
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

  const loadFeeStructureDetails = async (feeStructureId: number) => {
    try {
      setLoadingFeeStructureDetails(true);
      const response = await api.get(`/incomes/fee-structures/${feeStructureId}/`);
      const feeStructure: FeeStructure = response;

      // Build line items from normalized fee structure components
      const newItems: InvoiceItem[] = [];

      if (feeStructure.components && feeStructure.components.length > 0) {
        feeStructure.components.forEach(component => {
          if (component.component_type === 'service' && component.service_item) {
            newItems.push({
              item_type: 'service',
              service_item: component.service_item,
              description: component.service_item_name || '',
              quantity: component.quantity,
              unit_price: component.effective_unit_price,
              line_total: component.line_total,
            } as InvoiceItem);
          } else if (component.component_type === 'inventory' && component.inventory_item) {
            newItems.push({
              item_type: 'inventory',
              inventory_item: component.inventory_item,
              description: component.inventory_item_name || '',
              quantity: component.quantity,
              unit_price: component.effective_unit_price,
              line_total: component.line_total,
            } as InvoiceItem);
          }
        });
      }

      // If no components defined, fall back to base_amount as a custom item
      if (newItems.length === 0) {
        const baseAmount = parseFloat(feeStructure.base_amount).toFixed(2);
        newItems.push({
          item_type: 'custom',
          description: feeStructure.name,
          quantity: '1',
          unit_price: baseAmount,
          line_total: baseAmount,
        } as InvoiceItem);
      }

      setFormData(prev => ({ ...prev, items: newItems }));
      success(`Loaded ${newItems.length} items from fee structure`);
    } catch (error) {
      console.error('Error loading fee structure details:', error);
      showError('Failed to load fee structure details');
    } finally {
      setLoadingFeeStructureDetails(false);
    }
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

    // Load fee structure details when selected (only in create mode)
    if (field === 'fee_structure' && value && !isEditMode) {
      loadFeeStructureDetails(value);
    }
  };

  const handleLineItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    if (field === 'unit_price' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Reset related fields when item_type changes
    if (field === 'item_type') {
      newItems[index].inventory_item = undefined;
      newItems[index].service_item = undefined;
      newItems[index].description = '';
      newItems[index].unit_price = '0.00';
    }

    // Auto-populate fields when service_item is selected
    if (field === 'service_item' && value) {
      const selectedItem = serviceItems.find(item => item.id === parseInt(value));
      if (selectedItem) {
        newItems[index].description = selectedItem.description || selectedItem.name;
        newItems[index].unit_price = selectedItem.default_price;
      }
    }

    // Auto-populate fields when inventory_item is selected
    if (field === 'inventory_item' && value) {
      const selectedItem = inventoryItems.find(item => item.id === parseInt(value));
      if (selectedItem) {
        newItems[index].description = selectedItem.name;
        newItems[index].unit_price = selectedItem.selling_price;
      }
    }

    // Calculate line total
    const quantity = parseFloat(newItems[index].quantity || '0');
    const unitPrice = parseFloat(newItems[index].unit_price || '0');
    newItems[index].line_total = (quantity * unitPrice).toFixed(2);

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_type: 'service',
          description: '',
          quantity: '1',
          unit_price: '0.00',
          line_total: '0.00',
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
      return sum + parseFloat(item.line_total || '0');
    }, 0);

    const discount = parseFloat(formData.discount_amount || '0');
    const total = subtotal - discount;

    return {
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
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
        if (!item.description.trim()) {
          newErrors[`item_${idx}_description`] = 'Description is required';
        }
        if (parseFloat(item.quantity) <= 0) {
          newErrors[`item_${idx}_quantity`] = 'Quantity must be greater than 0';
        }
        if (parseFloat(item.unit_price) <= 0) {
          newErrors[`item_${idx}_unit_price`] = 'Unit price must be greater than 0';
        }
        if (item.item_type === 'service' && !item.service_item) {
          newErrors[`item_${idx}_service_item`] = 'Please select a service item';
        }
        if (item.item_type === 'inventory' && !item.inventory_item) {
          newErrors[`item_${idx}_inventory_item`] = 'Please select an inventory item';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (submitting) {
      return;
    }

    if (!validateForm()) {
      showError('Please fix the validation errors');
      return;
    }

    setSubmitting(true);

    try {
      // Build clean item payloads — include catalog FKs only for their type
      const cleanedItems = formData.items.map(item => {
        const cleanItem: InvoiceItem = {
          ...(item.id && { id: item.id }), // Include id if it exists (for edit mode)
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        };

        // Only include service_item for service type items
        if (item.item_type === 'service' && item.service_item) {
          cleanItem.service_item = item.service_item;
        }

        // Only include inventory_item for inventory type items
        if (item.item_type === 'inventory' && item.inventory_item) {
          cleanItem.inventory_item = item.inventory_item;
        }

        // Include metadata if present
        if (item.metadata) {
          cleanItem.metadata = item.metadata;
        }

        return cleanItem;
      });

      const invoiceData: CreateInvoiceData = {
        client: formData.client,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        description: formData.description,
        notes: formData.notes,
        discount_amount: formData.discount_amount,
        fee_structure: formData.fee_structure || null,
        status: formData.status,
        metadata: {},
        items: cleanedItems,
      };

      let createdInvoice;
      if (isEditMode && id) {
        // Update existing invoice
        createdInvoice = await invoiceService.updateInvoice(parseInt(id), invoiceData);
        success(`Invoice ${createdInvoice.invoice_number} updated successfully`);
      } else {
        // Create new invoice
        createdInvoice = await invoiceService.createInvoice(invoiceData);
        success(`Invoice ${createdInvoice.invoice_number} created successfully`);
      }

      navigate('/sales/invoices');
    } catch (error: any) {
      console.error('Error saving invoice:', error);

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
          showError(
            error.response?.data?.message || `Failed to ${isEditMode ? 'update' : 'create'} invoice`
          );
        }
      } else {
        showError(`Failed to ${isEditMode ? 'update' : 'create'} invoice`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totals = calculateTotals();
  const selectedClient = clients.find(c => c.id === formData.client);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading invoice...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? `Edit Invoice ${originalInvoiceNumber}` : 'Create Invoice'}
        </h1>
        <p className="text-gray-600">
          {isEditMode
            ? 'Update invoice details and line items'
            : 'Create a unified invoice with services, inventory, or custom items'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.client}
                onChange={e => handleInputChange('client', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.client ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loadingClients || isEditMode} // Disable client change in edit mode?
              >
                <option value={0}>Select a client...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.email ? `(${client.email})` : ''}
                  </option>
                ))}
              </select>
              {errors.client && <p className="text-red-500 text-sm mt-1">{errors.client}</p>}

              {/* Preselected client notice */}
              {preselectedClientId && preselectedClientName && !isEditMode && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Note:</span> Creating invoice for{' '}
                    <strong>{preselectedClientName}</strong>. You can change the client if needed.
                  </p>
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
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.invoice_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.invoice_date && (
                <p className="text-red-500 text-sm mt-1">{errors.invoice_date}</p>
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
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.due_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.due_date && <p className="text-red-500 text-sm mt-1">{errors.due_date}</p>}
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the invoice..."
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => handleInputChange('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Internal notes (not visible to client)..."
              />
            </div>

            {/* Fee Structure Template (Optional) - Only show in create mode */}
            {!isEditMode && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Structure Template (Optional)
                </label>
                <select
                  value={formData.fee_structure || ''}
                  onChange={e =>
                    handleInputChange(
                      'fee_structure',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loadingFeeStructures || loadingFeeStructureDetails}
                >
                  <option value="">None - Add items manually</option>
                  {feeStructures.map(fee => (
                    <option key={fee.id} value={fee.id}>
                      {fee.name} - ₦{fee.base_amount}
                    </option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">
                  {loadingFeeStructureDetails
                    ? 'Loading fee structure items...'
                    : 'Select a fee structure to auto-populate line items. You can modify them after.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Item
            </button>
          </div>

          {errors.items && <p className="text-red-500 text-sm mb-4">{errors.items}</p>}

          <div className="space-y-4">
            {formData.items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-medium text-gray-900">Item #{index + 1}</h3>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Item Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={item.item_type}
                      onChange={e => handleLineItemChange(index, 'item_type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="service">Service / Fee</option>
                      <option value="inventory">Inventory Item</option>
                      <option value="custom">Custom Item</option>
                    </select>
                    <p className="text-gray-500 text-xs mt-1">
                      {item.item_type === 'service' &&
                        'Select from service catalog — entitlements auto-created on payment'}
                      {item.item_type === 'inventory' && 'Select from inventory items below'}
                      {item.item_type === 'custom' && 'Custom line item with manual entry'}
                    </p>
                  </div>

                  {/* Service Item selector (for service type) */}
                  {item.item_type === 'service' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">
                          Service Item <span className="text-red-500">*</span>
                        </label>
                        {!isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setCreateServiceForItemIndex(index);
                              setShowCreateServiceModal(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                          >
                            + New Service
                          </button>
                        )}
                      </div>
                      <select
                        value={item.service_item || ''}
                        onChange={e =>
                          handleLineItemChange(
                            index,
                            'service_item',
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors[`item_${index}_service_item`]
                            ? 'border-red-500'
                            : 'border-gray-300'
                        }`}
                        disabled={loadingServices}
                      >
                        <option value="">
                          {loadingServices
                            ? 'Loading services…'
                            : serviceItems.length === 0
                              ? 'No services yet'
                              : 'Select service item...'}
                        </option>
                        {serviceItems.map(svcItem => (
                          <option key={svcItem.id} value={svcItem.id}>
                            {svcItem.name} ({svcItem.code}) — ₦{svcItem.default_price}
                            {svcItem.creates_entitlement ? ' ✓' : ''}
                          </option>
                        ))}
                      </select>
                      {errors[`item_${index}_service_item`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`item_${index}_service_item`]}
                        </p>
                      )}
                      {!loadingServices && serviceItems.length === 0 && !isEditMode ? (
                        <p className="text-amber-600 text-xs mt-1">
                          No service items in catalog.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setCreateServiceForItemIndex(index);
                              setShowCreateServiceModal(true);
                            }}
                            className="underline font-medium hover:text-amber-800"
                          >
                            Create one now →
                          </button>
                        </p>
                      ) : (
                        <p className="text-gray-400 text-xs mt-1">
                          ✓ = creates entitlement on payment
                        </p>
                      )}
                    </div>
                  )}

                  {/* Inventory Item (for inventory items) */}
                  {item.item_type === 'inventory' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Inventory Item <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={item.inventory_item || ''}
                        onChange={e =>
                          handleLineItemChange(
                            index,
                            'inventory_item',
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors[`item_${index}_inventory_item`]
                            ? 'border-red-500'
                            : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select inventory item...</option>
                        {inventoryItems.map(invItem => (
                          <option key={invItem.id} value={invItem.id}>
                            {invItem.name} ({invItem.sku}) - ₦{invItem.selling_price} - Available:{' '}
                            {invItem.total_available}
                          </option>
                        ))}
                      </select>
                      {errors[`item_${index}_inventory_item`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`item_${index}_inventory_item`]}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => handleLineItemChange(index, 'description', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[`item_${index}_description`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter item description..."
                    />
                    {errors[`item_${index}_description`] && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors[`item_${index}_description`]}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={e => handleLineItemChange(index, 'quantity', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[`item_${index}_quantity`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors[`item_${index}_quantity`] && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors[`item_${index}_quantity`]}
                      </p>
                    )}
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Price <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.unit_price}
                      onChange={e => handleLineItemChange(index, 'unit_price', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[`item_${index}_unit_price`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0.00"
                    />
                    {errors[`item_${index}_unit_price`] && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors[`item_${index}_unit_price`]}
                      </p>
                    )}
                  </div>

                  {/* Line Total (Read-only) */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Line Total
                    </label>
                    <input
                      type="text"
                      value={`₦${parseFloat(item.line_total || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Totals</h2>

          <div className="space-y-3">
            {/* Invoice-level Discount */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Invoice Discount</label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.discount_amount}
                onChange={e => handleInputChange('discount_amount', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">
                  ₦
                  {parseFloat(totals.subtotal).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount:</span>
                <span className="font-medium text-red-600">
                  -₦
                  {parseFloat(totals.discount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span>Total:</span>
                <span className="text-blue-600">
                  ₦
                  {parseFloat(totals.total).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Client Summary */}
        {selectedClient && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Invoice To:</h3>
            <p className="text-blue-800">
              <strong>{selectedClient.name}</strong>
            </p>
            {selectedClient.email && (
              <p className="text-blue-700 text-sm">{selectedClient.email}</p>
            )}
            {selectedClient.phone && (
              <p className="text-blue-700 text-sm">{selectedClient.phone}</p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/sales/invoices')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submitting
              ? isEditMode
                ? 'Updating...'
                : 'Creating...'
              : isEditMode
                ? 'Update Invoice'
                : 'Create Invoice'}
          </button>
        </div>
      </form>

      {/* Inline modal — create a new Service Item without leaving this page */}
      <CreateServiceItemModal
        open={showCreateServiceModal}
        onClose={() => {
          setShowCreateServiceModal(false);
          setCreateServiceForItemIndex(null);
        }}
        onCreated={(newItem: CreatedServiceItem) => {
          // Add to the local catalog list
          setServiceItems(prev => [...prev, newItem]);
          // Auto-select it in whichever line-item triggered the modal
          if (createServiceForItemIndex !== null) {
            handleLineItemChange(createServiceForItemIndex, 'service_item', newItem.id);
          }
          setShowCreateServiceModal(false);
          setCreateServiceForItemIndex(null);
        }}
      />
    </div>
  );
};

export default CreateUnifiedInvoice;
