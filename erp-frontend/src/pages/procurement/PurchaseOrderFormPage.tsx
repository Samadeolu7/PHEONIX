import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Package, ArrowLeft, Save, Send, Calculator } from 'lucide-react';

import { useAllSuppliers } from '../../hooks/useSuppliers';
import {
  usePurchaseOrder,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useDeletePurchaseOrder,
  useAllInventoryItems,
  useAllInventoryLocations,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useFormValidation } from '../../hooks/useFormValidation';
import { useOptimisticUpdates } from '../../hooks/useOptimisticUpdates';
import { useResponsive } from '../../hooks/useResponsive';
import { CreatePurchaseOrderData, PurchaseOrderItem } from '../../services/procurementService';
import {
  procurementValidationSchemas,
  validateFields,
  isFormValid,
  getAllErrors,
} from '../../utils/validation';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import ErrorFallback from '../../components/error/ErrorFallback';
import FormField from '../../components/ui/FormField';
import LoadingState from '../../components/ui/LoadingState';
import ConflictResolutionModal from '../../components/ui/ConflictResolutionModal';
import { FormSkeleton } from '../../components/ui/SkeletonLoader';

interface FormItem {
  item_id: string;
  quantity: number;
  unit_price: number;
}

interface FormData {
  supplier_id: string;
  delivery_location_id: string;
  expected_delivery_date: string;
  payment_terms: string;
  terms_conditions: string;
  items: FormItem[];
  apply_tax: boolean;
  tax_rate: number;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const PurchaseOrderFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { handleError, handleAsyncError } = useErrorHandler();
  const { isMobile, isTablet } = useResponsive();
  const isEditing = !!id;

  const [formData, setFormData] = useState<FormData>({
    supplier_id: '',
    delivery_location_id: '',
    expected_delivery_date: '',
    payment_terms: 'net_30',
    terms_conditions: '',
    items: [],
    apply_tax: false,
    tax_rate: 7.5,
  });

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);

  // Form validation
  const {
    validationResults,
    isValid,
    errors,
    validateAllFields,
    handleFieldChange,
    handleFieldBlur,
    getFieldValidation,
    hasFieldError,
    getFieldError,
  } = useFormValidation(procurementValidationSchemas.purchaseOrder);

  // Optimistic updates
  const { optimisticCreate, optimisticUpdate } = useOptimisticUpdates({
    onConflict: async conflict => {
      setConflictData(conflict);
      setShowConflictModal(true);
      return new Promise(resolve => {
        // This will be resolved when user makes a choice in the modal
        window.resolveConflict = resolve;
      });
    },
  });

  // React Query hooks
  const { data: existingPO, isLoading: poLoading } = usePurchaseOrder(
    parseInt(id || '0'),
    isEditing
  );

  const { data: suppliersData = [], isLoading: suppliersLoading } = useAllSuppliers({
    is_active: true,
  });

  const { data: inventoryItemsData = [], isLoading: itemsLoading } = useAllInventoryItems({
    is_active: true,
    limit: 1000,
  });

  const { data: locationsData = [], isLoading: locationsLoading } = useAllInventoryLocations({
    is_active: true,
  });

  // Mutations
  const createPOMutation = useCreatePurchaseOrder();
  const updatePOMutation = useUpdatePurchaseOrder();
  const deletePOMutation = useDeletePurchaseOrder();

  // Extract data from React Query responses
  const suppliers = suppliersData || [];
  const inventoryItems = inventoryItemsData || [];
  const locations = locationsData || [];

  // Debug logging
  console.log('Form data loading states:', {
    suppliersLoading,
    itemsLoading,
    locationsLoading,
    suppliersCount: suppliers.length,
    itemsCount: inventoryItems.length,
    locationsCount: locations.length,
  });

  const loading = suppliersLoading || itemsLoading || locationsLoading || (isEditing && poLoading);
  const processing = createPOMutation.isPending || updatePOMutation.isPending;

  // Load existing PO data for editing
  useEffect(() => {
    if (existingPO && isEditing) {
      setFormData({
        supplier_id: existingPO.supplier?.toString() || '',
        delivery_location_id: existingPO.delivery_location?.toString() || '',
        expected_delivery_date: existingPO.expected_delivery_date || '',
        payment_terms: existingPO.payment_terms,
        terms_conditions: existingPO.notes || '',
        items: (existingPO.items || []).map(item => ({
          item_id: item.item?.toString() || '',
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price),
        })),
        apply_tax: false,
        tax_rate: 7.5,
      });
    }
  }, [existingPO, isEditing]);

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, unit_price: 0 }],
    });
  };

  const updateItem = (index: number, field: keyof FormItem, value: string | number) => {
    if (field === 'unit_price' && typeof value === 'string') {
      if (!isValidDecimalInput(value)) {
        return;
      }

      const parsedValue = parseFloat(value);
      value = Number.isNaN(parsedValue) ? 0 : parsedValue;
    }

    console.log('updateItem called:', { index, field, value, currentItems: formData.items });
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    console.log('Updated items:', newItems);
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const calculateSubtotal = () => {
    return formData.items.reduce(
      (sum, item) =>
        sum + parseFloat(item.quantity.toString()) * parseFloat(item.unit_price.toString() || '0'),
      0
    );
  };

  const calculateTax = (subtotal: number) => {
    if (!formData.apply_tax) return 0;
    return subtotal * (formData.tax_rate / 100);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    return subtotal + tax;
  };

  const handleSubmit = async (asDraft = false) => {
    // Comprehensive validation
    const validationResults = validateAllFields(formData);

    // Validate items individually
    const itemValidationErrors: string[] = [];
    formData.items.forEach((item, index) => {
      const itemValidation = validateFields(item, procurementValidationSchemas.purchaseOrderItem);
      if (!isFormValid(itemValidation)) {
        const errors = getAllErrors(itemValidation);
        itemValidationErrors.push(`Item ${index + 1}: ${errors.join(', ')}`);
      }
    });

    if (!isFormValid(validationResults) || itemValidationErrors.length > 0) {
      const allErrors = [...getAllErrors(validationResults), ...itemValidationErrors];
      toast.error(`Please fix the following errors: ${allErrors.join('; ')}`);
      return;
    }

    const submitData: CreatePurchaseOrderData = {
      supplier: parseInt(formData.supplier_id),
      delivery_location: parseInt(formData.delivery_location_id),
      order_date: new Date().toISOString().split('T')[0], // Add order_date (defaults to today)
      expected_delivery_date: formData.expected_delivery_date || undefined,
      payment_terms: formData.payment_terms as
        | 'cash'
        | 'net_15'
        | 'net_30'
        | 'net_60'
        | 'net_90'
        | 'custom',
      status: 'draft', // Add default status
      notes: formData.terms_conditions,
      items: formData.items.map(item => ({
        item: parseInt(item.item_id), // Changed from item_id to item
        quantity: item.quantity.toString(), // Ensure it's a string as per API spec
        unit_price: item.unit_price.toString(),
        total_price: (
          parseFloat(item.quantity.toString()) * parseFloat(item.unit_price.toString())
        ).toString(), // Add required total_price
      })),
    };

    try {
      if (isEditing) {
        const result = await updatePOMutation.mutateAsync({ id: parseInt(id!), data: submitData });
        toast.success('Purchase Order updated successfully!');
        navigate('/procurement/orders');
      } else {
        const result = await createPOMutation.mutateAsync(submitData);
        toast.success('Purchase Order created successfully!');
        navigate('/procurement/orders');
      }
    } catch (err: unknown) {
      handleError(err, isEditing ? 'update purchase order' : 'create purchase order', {
        onRetry: () => handleSubmit(asDraft),
      });
    }
  };

  const handleDelete = async () => {
    if (!isEditing || !existingPO) return;

    if (
      !confirm(
        `Are you sure you want to delete Purchase Order ${existingPO.po_number}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deletePOMutation.mutateAsync(parseInt(id!));
      toast.success('Purchase Order deleted successfully!');
      navigate('/procurement/orders');
    } catch (err: unknown) {
      handleError(err, 'delete purchase order', {
        onRetry: () => handleDelete(),
      });
    }
  };

  const handleConflictResolve = (
    resolution: 'use_local' | 'use_server' | 'merge',
    mergedData?: any
  ) => {
    if (window.resolveConflict) {
      const resolvedData =
        resolution === 'use_local'
          ? conflictData.localData
          : resolution === 'use_server'
            ? conflictData.serverData
            : mergedData || conflictData.serverData;

      window.resolveConflict(resolvedData);
      delete window.resolveConflict;
    }
    setShowConflictModal(false);
    setConflictData(null);
  };

  if (loading) {
    return <LoadingState message="Loading purchase order form..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorFallback
          title="Purchase Order Form Error"
          message="Failed to load the purchase order form. Please try again."
          showRetry={true}
          showGoBack={true}
          onGoBack={() => navigate('/procurement/orders')}
        />
      }
    >
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Conflict Resolution Modal */}
        {showConflictModal && conflictData && (
          <ConflictResolutionModal
            isOpen={showConflictModal}
            onClose={() => setShowConflictModal(false)}
            localData={conflictData.localData}
            serverData={conflictData.serverData}
            onResolve={handleConflictResolve}
            title="Purchase Order Conflict"
            description="This purchase order has been modified by another user. Please choose how to resolve the conflict."
          />
        )}
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <button
              onClick={() => navigate('/procurement/orders')}
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#1f2937',
                }}
              >
                {isEditing ? 'Edit Purchase Order' : 'Create Purchase Order'}
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
                {isEditing
                  ? `Editing PO: ${existingPO?.po_number}`
                  : 'Create a new purchase order for supplier goods'}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : '2fr 1fr',
            gap: isMobile ? '24px' : '32px',
          }}
        >
          {/* Main Form */}
          <div>
            {/* Basic Information */}
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 24px 0',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#1f2937',
                }}
              >
                Basic Information
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Supplier *
                  </label>
                  <select
                    value={formData.supplier_id}
                    onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Delivery Location *
                  </label>
                  <select
                    value={formData.delivery_location_id}
                    onChange={e =>
                      setFormData({ ...formData, delivery_location_id: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select location...</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formData.expected_delivery_date}
                    onChange={e =>
                      setFormData({ ...formData, expected_delivery_date: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Payment Terms
                  </label>
                  <select
                    value={formData.payment_terms}
                    onChange={e => setFormData({ ...formData, payment_terms: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="cash">Cash on Delivery</option>
                    <option value="net_15">Net 15 Days</option>
                    <option value="net_30">Net 30 Days</option>
                    <option value="net_60">Net 60 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Terms & Conditions
                </label>
                <textarea
                  value={formData.terms_conditions}
                  onChange={e => setFormData({ ...formData, terms_conditions: e.target.value })}
                  placeholder="Enter any special terms and conditions..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            {/* Items Section */}
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '24px',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                  Items
                </h2>
                <button
                  onClick={addItem}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Plus size={16} />
                  Add Item
                </button>
              </div>

              {formData.items.length === 0 ? (
                <div
                  style={{
                    padding: '48px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <p style={{ margin: 0 }}>No items added yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {formData.items.map((item, index) => {
                    const selectedItem = inventoryItems.find(i => i.id.toString() === item.item_id);
                    console.log(`Item ${index}:`, {
                      item,
                      selectedItem,
                      item_id: item.item_id,
                      item_id_type: typeof item.item_id,
                      inventoryItems: inventoryItems.map(i => ({ id: i.id, name: i.name })),
                    });
                    return (
                      <div
                        key={`item-${index}-${item.item_id || 'empty'}`}
                        style={{
                          padding: '20px',
                          background: '#f9fafb',
                          borderRadius: '8px',
                          border: '2px solid #e5e7eb',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                            gap: '16px',
                            alignItems: 'end',
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Item *
                            </label>
                            <select
                              value={item.item_id || ''}
                              onChange={e => {
                                console.log('Item selection changed:', e.target.value);
                                const selectedItem = inventoryItems.find(
                                  i => i.id.toString() === e.target.value
                                );
                                console.log('Selected item:', selectedItem);

                                // Update both item_id and unit_price in a single update to prevent race conditions
                                const newItems = [...formData.items];
                                newItems[index] = {
                                  ...newItems[index],
                                  item_id: e.target.value,
                                  unit_price: selectedItem
                                    ? parseFloat(selectedItem.cost_price)
                                    : newItems[index].unit_price,
                                };
                                setFormData({ ...formData, items: newItems });
                              }}
                              style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                              }}
                            >
                              <option value="">Select item...</option>
                              {inventoryItems.map(i => (
                                <option key={i.id} value={i.id}>
                                  {i.name} ({i.sku})
                                </option>
                              ))}
                            </select>
                            {selectedItem && (
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                SKU: {selectedItem.sku} | Cost: ₦
                                {parseFloat(selectedItem.cost_price).toLocaleString()}
                              </div>
                            )}
                          </div>

                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Quantity *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e =>
                                updateItem(index, 'quantity', parseFloat(e.target.value) || 0)
                              }
                              style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                              }}
                            />
                          </div>

                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Unit Price *
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.unit_price.toString()}
                              onChange={e => updateItem(index, 'unit_price', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                              }}
                              placeholder="0.00"
                            />
                          </div>

                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Total
                            </label>
                            <div
                              style={{
                                padding: '10px',
                                background: 'white',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#3b82f6',
                                textAlign: 'center',
                              }}
                            >
                              ₦{(item.quantity * item.unit_price).toLocaleString()}
                            </div>
                          </div>

                          <button
                            onClick={() => removeItem(index)}
                            style={{
                              padding: '10px',
                              border: 'none',
                              background: '#fef2f2',
                              color: '#ef4444',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Summary Sidebar */}
          <div>
            {/* Order Summary */}
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Calculator size={20} />
                Order Summary
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: '#6b7280' }}>Items:</span>
                  <span style={{ fontWeight: 600 }}>{formData.items.length}</span>
                </div>

                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: '#6b7280' }}>Subtotal:</span>
                  <span style={{ fontWeight: 600 }}>₦{calculateSubtotal().toLocaleString()}</span>
                </div>

                {/* Tax toggle */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <label
                    style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.apply_tax}
                      onChange={e => setFormData({ ...formData, apply_tax: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Apply VAT
                  </label>
                  {formData.apply_tax && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={formData.tax_rate}
                        onChange={e =>
                          setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })
                        }
                        style={{
                          width: '60px',
                          padding: '4px 6px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '13px',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>%</span>
                    </div>
                  )}
                </div>
                {formData.apply_tax && (
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ color: '#6b7280' }}>VAT ({formData.tax_rate}%):</span>
                    <span style={{ fontWeight: 600 }}>
                      ₦{calculateTax(calculateSubtotal()).toLocaleString()}
                    </span>
                  </div>
                )}

                <div style={{ height: '1px', background: '#e5e7eb', margin: '8px 0' }} />

                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                    Total:
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>
                    ₦{calculateTotal().toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#1f2937',
                }}
              >
                Actions
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={!formData.supplier_id || formData.items.length === 0 || processing}
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    borderRadius: '8px',
                    background:
                      !formData.supplier_id || formData.items.length === 0 || processing
                        ? '#9ca3af'
                        : '#3b82f6',
                    color: 'white',
                    cursor:
                      !formData.supplier_id || formData.items.length === 0 || processing
                        ? 'not-allowed'
                        : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Save size={16} />
                  {processing ? 'Saving...' : isEditing ? 'Update Order' : 'Create Order'}
                </button>

                {isEditing ? (
                  <button
                    onClick={handleDelete}
                    disabled={deletePOMutation.isPending}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      background: deletePOMutation.isPending ? '#9ca3af' : '#dc2626',
                      color: 'white',
                      cursor: deletePOMutation.isPending ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Trash2 size={16} />
                    {deletePOMutation.isPending ? 'Deleting...' : 'Delete Order'}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/procurement/orders')}
                    style={{
                      padding: '12px 20px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default PurchaseOrderFormPage;
