import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, FileText, Users, Clock, DollarSign, Package, Upload } from 'lucide-react';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { useCreateQuote } from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { PurchaseRequisition, Supplier } from '../../types/procurement';

interface QuoteRequestFormProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  suppliersWithQuotes?: number[]; // Array of supplier IDs that already have quotes
}

interface QuoteRequestData {
  requisition: number;
  supplier: number | null;
  quote_date: string;
  valid_until: string;
  subtotal: string;
  tax_amount: string;
  shipping_cost: string;
  total_amount: string;
  payment_terms: string;
  delivery_terms: string;
  status: string;
  notes: string;
  attachment: File | null;
  items: QuoteItemData[];
}

interface QuoteItemData {
  item: number; // This should be the item ID (item.id from requisition), not requisition item ID
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  lead_time_days: number;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const QuoteRequestForm: React.FC<QuoteRequestFormProps> = ({
  requisition,
  isOpen,
  onClose,
  onSuccess,
  suppliersWithQuotes = [], // Default to empty array
}) => {
  const toast = useToast();
  const { data: suppliers = [], isLoading: loadingSuppliers } = useAllSuppliers();
  const createQuoteMutation = useCreateQuote();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize formData properly
  const initialFormData = () => {
    console.log('Requisition items:', requisition.items);

    // Check if items have valid item IDs, if not, we need to handle this differently
    const initialItems = (requisition.items || [])
      .map(item => {
        console.log('Processing item:', item);

        // The backend expects an 'item' field that references an inventory item
        // If the requisition item doesn't have a valid item ID, we need to either:
        // 1. Skip this item (not ideal)
        // 2. Create a temporary inventory item (complex)
        // 3. Handle free-text items differently in the backend

        // For now, let's only include items that have valid inventory item references
        return {
          item: item.item || 0, // This will be filtered out if 0
          description: item.description || '',
          quantity: item.quantity || '0',
          unit_price: item.estimated_unit_price || '0.00',
          total_price: (
            parseFloat(item.quantity || '0') * parseFloat(item.estimated_unit_price || '0')
          ).toFixed(2),
          lead_time_days: 0,
        };
      })
      .filter(item => item.item > 0); // Only include items with valid inventory item IDs

    console.log('Filtered items with valid item IDs:', initialItems);

    const itemsSubtotal = initialItems.reduce(
      (sum, item) => sum + parseFloat(item.total_price || '0'),
      0
    );

    return {
      requisition: requisition.id || 0,
      supplier: null,
      quote_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal: itemsSubtotal.toFixed(2),
      tax_amount: '0.00',
      shipping_cost: '0.00',
      total_amount: itemsSubtotal.toFixed(2),
      payment_terms: 'net_30',
      delivery_terms: '',
      status: 'received',
      notes: '',
      attachment: null,
      items: initialItems,
    };
  };

  const [formData, setFormData] = useState<QuoteRequestData>(initialFormData());
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});


  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData(initialFormData());
      setSelectedSupplier(null);
      setErrors({});
    }
  }, [isOpen, requisition.items, requisition.id]);

  // Calculate totals automatically
  const calculateTotals = () => {
    const itemsSubtotal = formData.items.reduce((sum, item) => {
      const itemTotal = parseFloat(item.total_price) || 0;
      return sum + itemTotal;
    }, 0);

    const taxAmount = parseFloat(formData.tax_amount) || 0;
    const shippingCost = parseFloat(formData.shipping_cost) || 0;
    const totalAmount = itemsSubtotal + taxAmount + shippingCost;

    setFormData(prev => ({
      ...prev,
      subtotal: itemsSubtotal.toFixed(2),
      total_amount: totalAmount.toFixed(2),
    }));
  };

  // Update item calculations
  const updateItemPrice = (
    index: number,
    field: 'unit_price' | 'lead_time_days',
    value: string | number
  ) => {
    if (field === 'unit_price' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => {
      const newItems = [...prev.items];
      const item = newItems[index];

      if (field === 'unit_price') {
        const unitPrice = parseFloat(value as string) || 0;
        const quantity = parseFloat(item.quantity) || 0;
        item.unit_price = value as string;
        item.total_price = (unitPrice * quantity).toFixed(2);
      } else if (field === 'lead_time_days') {
        item.lead_time_days = parseInt(value as string) || 0;
      }

      return { ...prev, items: newItems };
    });
  };

  // Recalculate totals when items, tax, or shipping change
  useEffect(() => {
    calculateTotals();
  }, [formData.items, formData.tax_amount, formData.shipping_cost]);

  const handleSupplierSelect = (supplierId: number) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    if (selectedSupplier?.id === supplierId) {
      // Deselect current supplier
      setSelectedSupplier(null);
      setFormData(prev => ({
        ...prev,
        supplier: null,
      }));
    } else {
      // Select new supplier
      setSelectedSupplier(supplier);
      setFormData(prev => ({
        ...prev,
        supplier: supplierId,
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, attachment: file }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier) {
      newErrors.supplier = 'A supplier must be selected';
    }

    if (!formData.quote_date) {
      newErrors.quote_date = 'Quote date is required';
    }

    if (!formData.valid_until) {
      newErrors.valid_until = 'Valid until date is required';
    }

    if (
      formData.quote_date &&
      formData.valid_until &&
      formData.quote_date >= formData.valid_until
    ) {
      newErrors.valid_until = 'Valid until date must be after quote date';
    }

    // Validate that there are items to quote
    if (formData.items.length === 0) {
      newErrors.items =
        'No items available for quote. Requisition items must be linked to inventory items.';
    }

    // Validate items
    formData.items.forEach((item, index) => {
      if (parseFloat(item.unit_price) <= 0) {
        newErrors[`item_${index}_unit_price`] = 'Unit price must be greater than 0';
      }
      if (item.lead_time_days < 0) {
        newErrors[`item_${index}_lead_time`] = 'Lead time cannot be negative';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form submitted');
    console.log('Form data:', formData);

    if (!validateForm()) {
      console.log('Invalid form - validation errors:', errors);
      return;
    }

    try {
      // Prepare the data in the format expected by the API
      // Use formData directly since it already contains all updated values
      const quoteRequestData = {
        requisition: formData.requisition,
        supplier: formData.supplier,
        quote_date: formData.quote_date,
        valid_until: formData.valid_until,
        subtotal: formData.subtotal,
        tax_amount: formData.tax_amount || '0.00',
        shipping_cost: formData.shipping_cost || '0.00',
        total_amount: formData.total_amount,
        payment_terms: formData.payment_terms || '',
        delivery_terms: formData.delivery_terms || '',
        status: formData.status,
        notes: formData.notes || '',
        attachment: null, // Send as null for now
        items: formData.items.map(item => ({
          item: item.item, // Use the item ID from formData
          description: item.description || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          lead_time_days: item.lead_time_days,
        })),
      };

      console.log('Sending quote request data:', quoteRequestData);

      // Send the request using the correct mutation
      await createQuoteMutation.mutateAsync(quoteRequestData);

      // console.log()
      toast.success('Quote request sent to supplier successfully!');
      // onSuccess?.();
      // onClose();
    } catch (error: any) {
      console.error('Failed to create quote request:', error);

      // Handle specific errors
      if (error.response?.data) {
        const errorData = error.response.data;
        console.log('Error data:', errorData);

        // Handle field-specific errors
        const fieldErrors: Record<string, string> = {};

        Object.keys(errorData).forEach(field => {
          if (Array.isArray(errorData[field])) {
            fieldErrors[field] = errorData[field][0];
          } else if (typeof errorData[field] === 'string') {
            fieldErrors[field] = errorData[field];
          }
        });

        setErrors(fieldErrors);

        // Show first error in toast
        const firstError = Object.values(errorData)[0];
        if (Array.isArray(firstError)) {
          toast.error(firstError[0]);
        } else if (typeof firstError === 'string') {
          toast.error(firstError);
        }
      } else {
        toast.error('Failed to create quote request. Please check the console for details.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
              Request Quotes
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              Request quotes from suppliers for {requisition.pr_number}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={24} color="#6b7280" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {/* Requisition Summary */}
          <div
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
              }}
            >
              Requisition Summary
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                fontSize: '14px',
              }}
            >
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>PR Number: </span>
                <span style={{ color: '#1f2937' }}>{requisition.pr_number}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Items: </span>
                <span style={{ color: '#1f2937' }}>{requisition.items?.length || 0}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Total Value: </span>
                <span style={{ color: '#1f2937' }}>
                  ₦{parseFloat(requisition.estimated_total || '0').toLocaleString()}
                </span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Required By: </span>
                <span style={{ color: '#1f2937' }}>
                  {new Date(requisition.required_by_date).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Supplier Selection */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <Users size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Select Suppliers *
            </label>

            {loadingSuppliers ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                Loading suppliers...
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                {suppliers.map(supplier => {
                  const hasQuote = suppliersWithQuotes.includes(supplier.id);
                  return (
                    <div
                      key={supplier.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: hasQuote ? 'not-allowed' : 'pointer',
                        backgroundColor: hasQuote
                          ? '#f9fafb'
                          : selectedSupplier?.id === supplier.id
                            ? '#eff6ff'
                            : 'white',
                        opacity: hasQuote ? 0.6 : 1,
                      }}
                      onClick={() => !hasQuote && handleSupplierSelect(supplier.id)}
                    >
                      <input
                        type="radio"
                        name="supplier"
                        checked={selectedSupplier?.id === supplier.id}
                        disabled={hasQuote}
                        onChange={() => {}} // Handled by onClick
                        style={{ marginRight: '12px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: '500',
                            color: hasQuote ? '#9ca3af' : '#1f2937',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {supplier.name}
                          {hasQuote && (
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#f59e0b',
                                backgroundColor: '#fef3c7',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 600,
                              }}
                            >
                              Quote Submitted
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: hasQuote ? '#9ca3af' : '#6b7280' }}>
                          {supplier.contact_person} • {supplier.email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {errors.supplier && (
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                {errors.supplier}
              </p>
            )}

            {/* Selected Supplier Summary */}
            {selectedSupplier && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  Selected supplier:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {selectedSupplier.name}
                    <button
                      type="button"
                      onClick={() => handleSupplierSelect(selectedSupplier.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quote Dates */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px',
                }}
              >
                <Calendar size={16} style={{ display: 'inline', marginRight: '8px' }} />
                Quote Date *
              </label>
              <input
                type="date"
                value={formData.quote_date}
                onChange={e => setFormData(prev => ({ ...prev, quote_date: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
              {errors.quote_date && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                  {errors.quote_date}
                </p>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px',
                }}
              >
                <Clock size={16} style={{ display: 'inline', marginRight: '8px' }} />
                Valid Until *
              </label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={e => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
              {errors.valid_until && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                  {errors.valid_until}
                </p>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Payment Terms
            </label>
            <select
              value={formData.payment_terms}
              onChange={e => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="cash">Cash</option>
              <option value="net_15">Net 15 Days</option>
              <option value="net_30">Net 30 Days</option>
              <option value="net_60">Net 60 Days</option>
              <option value="net_90">Net 90 Days</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Delivery Terms */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Delivery Terms
            </label>
            <input
              type="text"
              value={formData.delivery_terms}
              onChange={e => setFormData(prev => ({ ...prev, delivery_terms: e.target.value }))}
              placeholder="e.g., FOB Destination, CIF, etc."
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          {/* File Upload */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <Upload size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Attachment (Optional)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
            {formData.attachment && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                Selected file: {formData.attachment.name}
              </div>
            )}
            {errors.attachment && (
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                {errors.attachment}
              </p>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <FileText size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Additional Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional requirements or specifications for suppliers..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Quote Items */}
          <div
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
              }}
            >
              <Package size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Quote Items ({formData.items.length})
            </h3>

            {/* Warning if no items can be included */}
            {formData.items.length === 0 && (
              <div
                style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    color: '#92400e',
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  ⚠️ No items available for quote
                </div>
                <div style={{ color: '#92400e', fontSize: '12px' }}>
                  The requisition items are not linked to inventory items. To create quotes,
                  requisition items must be selected from the inventory catalog rather than entered
                  as free text.
                </div>
              </div>
            )}

            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              {formData.items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <div
                      style={{
                        fontWeight: '600',
                        color: '#1f2937',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }}
                    >
                      {item.description}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Quantity Required: {item.quantity}
                    </div>
                  </div>

                  <div
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        <DollarSign size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Unit Price (₦)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.unit_price}
                        onChange={e => updateItemPrice(index, 'unit_price', e.target.value)}
                        placeholder="0.00"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: errors[`item_${index}_unit_price`]
                            ? '1px solid #ef4444'
                            : '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                      {errors[`item_${index}_unit_price`] && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#ef4444' }}>
                          {errors[`item_${index}_unit_price`]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Total Price (₦)
                      </label>
                      <input
                        type="text"
                        value={`₦${parseFloat(item.total_price || '0').toLocaleString()}`}
                        readOnly
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Lead Time (Days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.lead_time_days}
                        onChange={e => updateItemPrice(index, 'lead_time_days', e.target.value)}
                        placeholder="0"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: errors[`item_${index}_lead_time`]
                            ? '1px solid #ef4444'
                            : '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                      {errors[`item_${index}_lead_time`] && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#ef4444' }}>
                          {errors[`item_${index}_lead_time`]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '4px',
                        }}
                      >
                        Quantity
                      </label>
                      <input
                        type="text"
                        value={item.quantity}
                        readOnly
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quote Totals */}
          <div
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
              }}
            >
              <DollarSign size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Quote Totals
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Subtotal (₦)
                </label>
                <input
                  type="text"
                  value={`₦${parseFloat(formData.subtotal || '0').toLocaleString()}`}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: '#f9fafb',
                    color: '#6b7280',
                    fontWeight: '600',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Tax Amount (₦)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.tax_amount}
                  onChange={e => {
                    if (!isValidDecimalInput(e.target.value)) {
                      return;
                    }
                    setFormData(prev => ({ ...prev, tax_amount: e.target.value }));
                  }}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Shipping Cost (₦)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.shipping_cost}
                  onChange={e => {
                    if (!isValidDecimalInput(e.target.value)) {
                      return;
                    }
                    setFormData(prev => ({ ...prev, shipping_cost: e.target.value }));
                  }}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '16px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                  Total Amount:
                </span>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>
                  ₦{parseFloat(formData.total_amount || '0').toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createQuoteMutation.isPending}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: createQuoteMutation.isPending ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: createQuoteMutation.isPending ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              {createQuoteMutation.isPending ? 'Sending Request...' : 'Send Quote Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuoteRequestForm;
