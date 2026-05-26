import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Package, ArrowLeft, Save, Send, Search, X } from 'lucide-react';

import {
  usePurchaseRequisition,
  useCreatePurchaseRequisition,
  useCreatePurchaseRequisitionWithWorkflow,
  useUpdatePurchaseRequisition,
  useInventoryItems,
  useSubmitRequisition,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { InventoryItem, procurementService } from '../../services/procurementService';

interface FormItem {
  item: number | null;
  description: string;
  quantity: string;
  estimated_unit_price: string;
  notes: string;
}

interface FormData {
  department: string;
  request_date: string;
  required_by_date: string;
  purpose: string;
  notes: string;
  items: FormItem[];
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const RequisitionFormPageSimplified: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEditing = !!id;

  const [formData, setFormData] = useState<FormData>({
    department: '',
    request_date: new Date().toISOString().split('T')[0],
    required_by_date: '',
    purpose: '',
    notes: '',
    items: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [useWorkflow, setUseWorkflow] = useState(false); // Default to workflow

  // React Query hooks
  const { data: existingRequisition, isLoading: requisitionLoading } = usePurchaseRequisition(
    parseInt(id || '0'),
    isEditing
  );

  const { data: inventoryItemsData, isLoading: itemsLoading } = useInventoryItems({
    search: itemSearchQuery || undefined,
    is_active: true,
    limit: 50,
  });

  // Mutations
  const createRequisitionMutation = useCreatePurchaseRequisition();
  const createRequisitionWithWorkflowMutation = useCreatePurchaseRequisitionWithWorkflow();
  const updateRequisitionMutation = useUpdatePurchaseRequisition();
  const submitRequisitionMutation = useSubmitRequisition();

  // Extract data from React Query responses
  const inventoryItems = inventoryItemsData?.results || [];

  const loading = itemsLoading || (isEditing && requisitionLoading);
  const processing =
    createRequisitionMutation.isPending ||
    createRequisitionWithWorkflowMutation.isPending ||
    updateRequisitionMutation.isPending ||
    submitRequisitionMutation.isPending;

  // Load existing requisition data for editing
  useEffect(() => {
    if (existingRequisition && isEditing) {
      setFormData({
        department: existingRequisition.department || '',
        request_date: existingRequisition.request_date || new Date().toISOString().split('T')[0],
        required_by_date: existingRequisition.required_by_date || '',
        purpose: existingRequisition.purpose || '',
        notes: existingRequisition.notes || '',
        items: (existingRequisition.items || []).map(item => ({
          item: item.item,
          description: item.description || '',
          quantity: item.quantity || '1',
          estimated_unit_price: item.estimated_unit_price || '0',
          notes: item.notes || '',
        })),
      });
    }
  }, [existingRequisition, isEditing]);

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleItemChange = (index: number, field: keyof FormItem, value: any) => {
    if (
      typeof value === 'string' &&
      (field === 'quantity' || field === 'estimated_unit_price') &&
      !isValidDecimalInput(value)
    ) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));

    // Clear item-specific errors
    const errorKey = `items.${index}.${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const addItem = (inventoryItem?: InventoryItem) => {
    const newItem: FormItem = {
      item: inventoryItem?.id || null,
      description: inventoryItem?.description || '',
      quantity: '1',
      estimated_unit_price: inventoryItem?.cost_price || '0',
      notes: '',
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    setShowItemSelector(false);
    setItemSearchQuery('');
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));

    // Clear errors for removed item
    const newErrors = { ...errors };
    Object.keys(newErrors).forEach(key => {
      if (key.startsWith(`items.${index}.`)) {
        delete newErrors[key];
      }
    });
    setErrors(newErrors);
  };

  const calculateTotalEstimatedCost = () => {
    return formData.items.reduce(
      (total, item) => total + parseFloat(item.quantity) * parseFloat(item.estimated_unit_price),
      0
    );
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Department validation
    if (!formData.department || formData.department.trim() === '') {
      newErrors.department = 'Department is required';
    }

    // Purpose validation
    if (!formData.purpose || formData.purpose.trim() === '') {
      newErrors.purpose = 'Purpose is required';
    }

    // Required by date validation
    if (!formData.required_by_date) {
      newErrors.required_by_date = 'Required by date is required';
    }

    // Items validation
    if (!formData.items || formData.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }

    // Validate individual items
    formData.items.forEach((item, index) => {
      if (!item.description || item.description.trim() === '') {
        newErrors[`items.${index}.description`] = 'Item description is required';
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        newErrors[`items.${index}.quantity`] = 'Quantity must be greater than 0';
      }
      if (!item.estimated_unit_price || parseFloat(item.estimated_unit_price) <= 0) {
        newErrors[`items.${index}.estimated_unit_price`] =
          'Estimated unit price must be greater than 0';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveAsDraft = async (): Promise<void> => {
    try {
      if (!validateForm()) {
        toast.error('Please fix the validation errors before saving');
        return;
      }

      const submitData = {
        ...formData,
        status: 'draft',
        requested_by: 1, // This should come from auth context
      };

      let savedRequisition;

      if (isEditing) {
        savedRequisition = await updateRequisitionMutation.mutateAsync({
          id: parseInt(id!),
          data: submitData,
        });
      } else {
        savedRequisition = await createRequisitionMutation.mutateAsync(submitData);
      }

      toast.success(
        `Purchase requisition ${isEditing ? 'updated' : 'saved'} as draft successfully!`
      );
      navigate('/procurement/requisitions');
    } catch (error: any) {
      console.error('Failed to save requisition as draft:', error);
      toast.error('Failed to save requisition. Please try again.');
    }
  };

  const handleSubmitForApproval = async (): Promise<void> => {
    try {
      if (!validateForm()) {
        toast.error('Please fix the validation errors before submitting');
        return;
      }

      let savedRequisition;

      if (isEditing) {
        // Editing always uses manual update
        const submitData = {
          ...formData,
          status: 'submitted',
          requested_by: 1, // This should come from auth context
        };

        savedRequisition = await updateRequisitionMutation.mutateAsync({
          id: parseInt(id!),
          data: submitData,
        });

        // Submit for approval if it was a draft
        if (savedRequisition.status === 'draft') {
          savedRequisition = await submitRequisitionMutation.mutateAsync(savedRequisition.id!);
        }

        toast.success('Requisition updated and submitted successfully!');
      } else {
        // New: choose based on toggle
        if (useWorkflow) {
          // Use workflow endpoint with retry disabled
          const workflowData = {
            ...formData,
            requested_by: 1, // This should come from auth context
            // Don't include status field for workflow
          };

          // Use the no-retry mutation hook
          savedRequisition = await createRequisitionWithWorkflowMutation.mutateAsync(workflowData);
          toast.success('Submitted via workflow successfully!');
        } else {
          // Use manual endpoint with status: 'submitted'
          const submitData = {
            ...formData,
            status: 'submitted',
            requested_by: 1, // This should come from auth context
          };

          savedRequisition = await createRequisitionMutation.mutateAsync(submitData);

          // Submit for approval if created as draft
          if (savedRequisition.status === 'draft') {
            savedRequisition = await submitRequisitionMutation.mutateAsync(savedRequisition.id!);
          }

          toast.success('Submitted for approval successfully!');
        }
      }

      navigate('/procurement/requisitions');
    } catch (error: any) {
      console.error('Failed to submit requisition for approval:', error);
      toast.error('Failed to submit requisition. Please try again.');
    }
  };

  const getInventoryItemById = (itemId: number): InventoryItem | undefined => {
    return inventoryItems.find(item => item.id === itemId);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/procurement/requisitions')}
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
              {isEditing ? 'Edit Purchase Requisition' : 'Create Purchase Requisition'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing
                ? 'Update requisition details and items'
                : 'Create a new purchase requisition for approval'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Main Form */}
        <div
          style={{
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
            Requisition Details
          </h2>

          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Department */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Department *
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={e => handleInputChange('department', e.target.value)}
                placeholder="e.g., IT Department, HR, Finance"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: `2px solid ${errors.department ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
              {errors.department && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                  {errors.department}
                </div>
              )}
            </div>

            {/* Purpose */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Purpose *
              </label>
              <textarea
                value={formData.purpose}
                onChange={e => handleInputChange('purpose', e.target.value)}
                placeholder="Explain why these items are needed and how they will be used"
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: `2px solid ${errors.purpose ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
              {errors.purpose && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                  {errors.purpose}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Request Date */}
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Request Date *
                </label>
                <input
                  type="date"
                  value={formData.request_date}
                  onChange={e => handleInputChange('request_date', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              {/* Required By Date */}
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Required By Date *
                </label>
                <input
                  type="date"
                  value={formData.required_by_date}
                  onChange={e => handleInputChange('required_by_date', e.target.value)}
                  min={formData.request_date}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.required_by_date ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
                {errors.required_by_date && (
                  <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {errors.required_by_date}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Additional Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={e => handleInputChange('notes', e.target.value)}
                placeholder="Any additional information or special requirements"
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Workflow Toggle */}
            {/* {!isEditing && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '16px',
                                padding: '16px',
                                background: '#f8fafc',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <label style={{
                                    fontSize: '14px',
                                    color: '#374151',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={useWorkflow}
                                        onChange={(e) => setUseWorkflow(e.target.checked)}
                                        style={{ marginRight: '8px' }}
                                    />
                                    Submit via Approval Workflow
                                </label>
                                <div style={{
                                    fontSize: '12px',
                                    color: '#6b7280',
                                    marginLeft: '8px'
                                }}>
                                    {useWorkflow
                                        ? 'Will be routed through approval chain automatically'
                                        : 'Will be saved as draft for manual submission'
                                    }
                                </div>
                            </div>
                        )} */}
          </div>
        </div>

        {/* Summary Sidebar */}
        <div
          style={{
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
            height: 'fit-content',
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
            Summary
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Items:</span>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>
                {formData.items.length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Quantity:</span>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>
                {formData.items.reduce((sum, item) => sum + parseFloat(item.quantity || '0'), 0)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                Total Estimated Cost:
              </span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                ₦{calculateTotalEstimatedCost().toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={handleSaveAsDraft}
              disabled={processing}
              style={{
                padding: '12px 16px',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                color: '#374151',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: processing ? 0.6 : 1,
              }}
            >
              <Save size={16} />
              {processing ? 'Saving...' : 'Save as Draft'}
            </button>

            <button
              onClick={handleSubmitForApproval}
              disabled={processing}
              style={{
                padding: '12px 16px',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                background: '#3b82f6',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: processing ? 0.6 : 1,
              }}
            >
              <Send size={16} />
              {processing ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          marginTop: '32px',
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
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>Items</h2>
          <button
            onClick={() => setShowItemSelector(true)}
            style={{
              padding: '8px 16px',
              border: '2px solid #10b981',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>

        {errors.items && (
          <div
            style={{
              color: '#ef4444',
              fontSize: '14px',
              marginBottom: '16px',
              padding: '12px',
              background: '#fef2f2',
              borderRadius: '8px',
            }}
          >
            {errors.items}
          </div>
        )}

        {formData.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
            <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '16px' }}>No items added yet</p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>Click "Add Item" to get started</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {formData.items.map((item, index) => (
              <div
                key={index}
                style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 500, color: '#1f2937' }}>
                    Item {index + 1}
                  </h4>
                  <button
                    onClick={() => removeItem(index)}
                    style={{
                      padding: '4px',
                      border: 'none',
                      background: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '16px' }}>
                  {/* Description */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151',
                      }}
                    >
                      Description *
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => handleItemChange(index, 'description', e.target.value)}
                      placeholder="Enter item description"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: `2px solid ${errors[`items.${index}.description`] ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                    />
                    {errors[`items.${index}.description`] && (
                      <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                        {errors[`items.${index}.description`]}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Quantity */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                        }}
                      >
                        Quantity *
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: `2px solid ${errors[`items.${index}.quantity`] ? '#ef4444' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          fontSize: '14px',
                        }}
                        placeholder="0.00"
                      />
                      {errors[`items.${index}.quantity`] && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                          {errors[`items.${index}.quantity`]}
                        </div>
                      )}
                    </div>

                    {/* Estimated Unit Price */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                        }}
                      >
                        Estimated Unit Price *
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.estimated_unit_price}
                        onChange={e =>
                          handleItemChange(index, 'estimated_unit_price', e.target.value)
                        }
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: `2px solid ${errors[`items.${index}.estimated_unit_price`] ? '#ef4444' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          fontSize: '14px',
                        }}
                        placeholder="0.00"
                      />
                      {errors[`items.${index}.estimated_unit_price`] && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                          {errors[`items.${index}.estimated_unit_price`]}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151',
                      }}
                    >
                      Notes
                    </label>
                    <textarea
                      value={item.notes}
                      onChange={e => handleItemChange(index, 'notes', e.target.value)}
                      placeholder="Any additional notes for this item"
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {/* Item Total */}
                  <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Item Total:</span>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                        ₦
                        {(
                          parseFloat(item.quantity || '0') *
                          parseFloat(item.estimated_unit_price || '0')
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Item Selector Modal */}
      {showItemSelector && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
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
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                Select Item
              </h3>
              <button
                onClick={() => setShowItemSelector(false)}
                style={{
                  padding: '4px',
                  border: 'none',
                  background: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#6b7280',
                  }}
                />
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={e => setItemSearchQuery(e.target.value)}
                  placeholder="Search inventory items..."
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 40px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            {/* Add Manual Item */}
            <button
              onClick={() => addItem()}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                background: 'white',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Plus size={16} />
              Add Manual Item
            </button>

            {/* Inventory Items */}
            <div style={{ display: 'grid', gap: '8px', maxHeight: '300px', overflow: 'auto' }}>
              {inventoryItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => addItem(item)}
                  style={{
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <div style={{ fontWeight: 500, color: '#1f2937', marginBottom: '4px' }}>
                    {item.name}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>
                    SKU: {item.sku} | Cost: ₦{parseFloat(item.cost_price).toLocaleString()}
                  </div>
                  {item.description && (
                    <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
                      {item.description}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {inventoryItems.length === 0 && !itemsLoading && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                No inventory items found
              </div>
            )}

            {itemsLoading && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                Loading items...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisitionFormPageSimplified;
