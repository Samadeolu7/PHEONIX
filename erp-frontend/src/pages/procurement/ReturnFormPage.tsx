import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Package,
  AlertCircle,
  Plus,
  Minus,
  FileText,
  Building,
  Calendar,
  DollarSign,
  Search,
  Filter,
} from 'lucide-react';

import {
  useGRNs,
  useGRN,
  useCreatePurchaseReturn,
  useUpdatePurchaseReturn,
  usePurchaseReturn,
  useAllProcurementSuppliers,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import {
  CreatePurchaseReturnData,
  GoodsReceivedNote,
  PurchaseReturn,
} from '../../services/procurementService';

interface ReturnFormData {
  grn_id: number | null;
  return_date: string;
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  refund_method: 'credit_note' | 'cash' | 'replacement';
  notes: string;
  items: ReturnItemFormData[];
}

interface ReturnItemFormData {
  grn_item_id: number;
  item_name: string;
  item_sku: string;
  quantity_received: number;
  quantity_returned: number;
  return_reason: string;
  condition: 'good' | 'damaged' | 'defective' | 'expired' | 'wrong_item';
  return_cost: string;
  unit_cost: string; // Add unit_cost to the interface
  notes: string;
}

const ReturnFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEditing = !!id;

  // State
  const [formData, setFormData] = useState<ReturnFormData>({
    grn_id: null,
    return_date: new Date().toISOString().split('T')[0],
    return_reason: 'damaged',
    refund_method: 'credit_note',
    notes: '',
    items: [],
  });

  const [selectedGRN, setSelectedGRN] = useState<GoodsReceivedNote | null>(null);
  const [showGRNSelector, setShowGRNSelector] = useState(!isEditing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GRN filtering state
  const [grnSearchQuery, setGrnSearchQuery] = useState('');
  const [grnFilterSupplier, setGrnFilterSupplier] = useState('all');
  const [grnFilterQualityStatus, setGrnFilterQualityStatus] = useState('all');
  const [grnDateFrom, setGrnDateFrom] = useState('');
  const [grnDateTo, setGrnDateTo] = useState('');

  // React Query hooks
  const { data: grnsData, isLoading: loadingGRNs } = useGRNs({
    search: grnSearchQuery || undefined,
    quality_status: grnFilterQualityStatus === 'all' ? undefined : grnFilterQualityStatus,
    supplier_id: grnFilterSupplier === 'all' ? undefined : parseInt(grnFilterSupplier),
    is_posted: true, // Only show posted GRNs that can have returns
    date_from: grnDateFrom || undefined,
    date_to: grnDateTo || undefined,
    ordering: '-received_date', // Show newest first
  });

  const { data: suppliersData = [] } = useAllProcurementSuppliers({});

  const { data: selectedGRNData } = useGRN(formData.grn_id || 0, !!formData.grn_id);

  const { data: existingReturn, isLoading: loadingReturn } = usePurchaseReturn(
    parseInt(id || '0'),
    isEditing
  );

  // Mutations
  const createReturnMutation = useCreatePurchaseReturn();
  const updateReturnMutation = useUpdatePurchaseReturn();

  const grns = grnsData?.results || [];

  // Initialize form data for editing
  useEffect(() => {
    if (isEditing && existingReturn) {
      setFormData({
        grn_id: existingReturn.grn,
        return_date: existingReturn.return_date,
        return_reason: existingReturn.return_reason,
        refund_method: existingReturn.refund_method,
        notes: existingReturn.notes || '',
        items: existingReturn.items.map(item => ({
          grn_item_id: item.grn_item_id,
          item_name: item.grn_item.item.name,
          item_sku: item.grn_item.item.sku,
          quantity_received: item.grn_item.quantity_received,
          quantity_returned: item.quantity_returned,
          return_reason: item.return_reason,
          condition: item.condition,
          return_cost: item.return_cost,
          unit_cost: item.grn_item.unit_cost, // Include unit_cost from GRN item
          notes: item.notes || '',
        })),
      });
      setShowGRNSelector(false);
    }
  }, [isEditing, existingReturn]);

  // Update selected GRN when GRN data is loaded
  useEffect(() => {
    if (selectedGRNData && formData.grn_id) {
      setSelectedGRN(selectedGRNData);

      // Initialize items from GRN if not already set
      if (formData.items.length === 0) {
        const grnItems = selectedGRNData.items.map(grnItem => ({
          grn_item_id: grnItem.id || grnItem.item, // Use the actual GRN item ID
          item_name: grnItem.item_name || `Item ${grnItem.item}`, // Use actual item name if available
          item_sku: grnItem.item_sku || `SKU-${grnItem.item}`, // Use actual SKU if available
          quantity_received: parseFloat(grnItem.quantity_accepted),
          quantity_returned: 0,
          return_reason: '',
          condition: 'good' as const,
          return_cost: '0.00',
          unit_cost: grnItem.unit_cost, // Store the actual unit cost from GRN
          notes: '',
        }));

        setFormData(prev => ({
          ...prev,
          items: grnItems,
        }));
      }
    }
  }, [selectedGRNData, formData.grn_id, formData.items.length]);

  const handleGRNSelect = (grnId: number) => {
    setFormData(prev => ({
      ...prev,
      grn_id: grnId,
      items: [], // Reset items when changing GRN
    }));
    setShowGRNSelector(false);
  };

  const handleInputChange = (field: keyof ReturnFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleItemChange = (index: number, field: keyof ReturnItemFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
              // Auto-calculate return cost when quantity changes using actual unit cost
              ...(field === 'quantity_returned'
                ? {
                    return_cost: (parseFloat(value) * parseFloat(item.unit_cost || '0')).toFixed(2),
                  }
                : {}),
            }
          : item
      ),
    }));
  };

  const addReturnItem = () => {
    if (!selectedGRN) return;

    // Show available GRN items that haven't been added yet
    const availableItems = selectedGRN.items.filter(
      grnItem =>
        !formData.items.some(returnItem => returnItem.grn_item_id === (grnItem.id || grnItem.item))
    );

    if (availableItems.length === 0) {
      toast.error('All items from this GRN have already been added');
      return;
    }

    const firstAvailable = availableItems[0];
    const newItem: ReturnItemFormData = {
      grn_item_id: firstAvailable.id || firstAvailable.item,
      item_name: firstAvailable.item_name || `Item ${firstAvailable.item}`,
      item_sku: firstAvailable.item_sku || `SKU-${firstAvailable.item}`,
      quantity_received: parseFloat(firstAvailable.quantity_accepted),
      quantity_returned: 0,
      return_reason: '',
      condition: 'good',
      return_cost: '0.00',
      unit_cost: firstAvailable.unit_cost, // Include the actual unit cost
      notes: '',
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const removeReturnItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.grn_id) {
      newErrors.grn_id = 'GRN selection is required';
    }

    if (!formData.return_date) {
      newErrors.return_date = 'Return date is required';
    }

    if (formData.items.length === 0) {
      newErrors.items = 'At least one return item is required';
    }

    // Validate each item
    formData.items.forEach((item, index) => {
      if (item.quantity_returned <= 0) {
        newErrors[`item_${index}_quantity`] = 'Return quantity must be greater than 0';
      }

      if (item.quantity_returned > item.quantity_received) {
        newErrors[`item_${index}_quantity`] = 'Return quantity cannot exceed received quantity';
      }

      if (!item.return_reason.trim()) {
        newErrors[`item_${index}_reason`] = 'Return reason is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData: CreatePurchaseReturnData = {
        grn: formData.grn_id!,
        return_date: formData.return_date,
        return_reason: formData.return_reason,
        refund_method: formData.refund_method,
        notes: formData.notes || undefined,
        items: formData.items.map(item => ({
          grn_item_id: item.grn_item_id,
          quantity_returned: item.quantity_returned,
          return_reason: item.return_reason,
          condition: item.condition,
          return_cost: item.return_cost,
          notes: item.notes || undefined,
        })),
      };

      if (isEditing) {
        await updateReturnMutation.mutateAsync({
          id: parseInt(id!),
          data: submitData,
        });
        toast.success('Purchase return updated successfully!');
      } else {
        await createReturnMutation.mutateAsync(submitData);
        toast.success('Purchase return created successfully!');
      }

      navigate('/procurement/returns');
    } catch (err: unknown) {
      console.error('Failed to save purchase return:', err);
      toast.error('Failed to save purchase return');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotalReturnValue = (): number => {
    return formData.items.reduce((total, item) => total + parseFloat(item.return_cost || '0'), 0);
  };

  if (loadingReturn || (isEditing && !existingReturn)) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading purchase return...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/procurement/returns')}
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
              {isEditing ? 'Edit Purchase Return' : 'Create Purchase Return'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing ? 'Update return details and items' : 'Create a new return to supplier'}
            </p>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              SHould Be only gnr that failed and are posted gnr so status shoudl be set to posted
              and
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* GRN Selection */}
        {showGRNSelector && (
          <div
            style={{
              marginBottom: '32px',
              padding: '24px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={20} />
              Select Goods Received Note (GRN)
            </h3>

            {/* GRN Search and Filters */}
            <div style={{ marginBottom: '20px' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Search
                  size={20}
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
                  placeholder="Search by GRN number, supplier, or PO number..."
                  value={grnSearchQuery}
                  onChange={e => setGrnSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 44px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              {/* Filter Controls */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={16} style={{ color: '#6b7280' }} />
                  <select
                    value={grnFilterQualityStatus}
                    onChange={e => setGrnFilterQualityStatus(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      minWidth: '140px',
                    }}
                  >
                    <option value="all">All Quality Status</option>
                    <option value="pending">Pending</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>

                <select
                  value={grnFilterSupplier}
                  onChange={e => setGrnFilterSupplier(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '14px',
                    minWidth: '140px',
                  }}
                >
                  <option value="all">All Suppliers</option>
                  {(suppliersData || []).map(supplier => (
                    <option key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: '#6b7280' }} />
                  <label style={{ fontSize: '14px', color: '#374151' }}>From:</label>
                  <input
                    type="date"
                    value={grnDateFrom}
                    onChange={e => setGrnDateFrom(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '14px', color: '#374151' }}>To:</label>
                  <input
                    type="date"
                    value={grnDateTo}
                    onChange={e => setGrnDateTo(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Clear Filters Button */}
                {(grnSearchQuery ||
                  grnFilterQualityStatus !== 'all' ||
                  grnFilterSupplier !== 'all' ||
                  grnDateFrom ||
                  grnDateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setGrnSearchQuery('');
                      setGrnFilterQualityStatus('all');
                      setGrnFilterSupplier('all');
                      setGrnDateFrom('');
                      setGrnDateTo('');
                    }}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#6b7280',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {loadingGRNs ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                Loading available GRNs...
              </div>
            ) : grns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                <AlertCircle size={48} style={{ margin: '0 auto 16px', color: '#d1d5db' }} />
                <p>No posted GRNs available for returns.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {grns.map(grn => (
                  <div
                    key={grn.id}
                    onClick={() => handleGRNSelect(grn.id)}
                    style={{
                      padding: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: formData.grn_id === grn.id ? '#eff6ff' : 'white',
                      borderColor: formData.grn_id === grn.id ? '#3b82f6' : '#e5e7eb',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <h4
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#1f2937',
                          }}
                        >
                          {grn.grn_number}
                        </h4>
                        <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                          <Building size={14} style={{ display: 'inline', marginRight: '4px' }} />
                          Supplier: {grn.supplier_name}
                        </p>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                          <Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} />
                          Received: {new Date(grn.received_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937' }}>
                          ₦{parseFloat(grn.total_amount).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {grn.items.length} item{grn.items.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {errors.grn_id && (
              <div
                style={{
                  marginTop: '8px',
                  color: '#ef4444',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <AlertCircle size={16} />
                {errors.grn_id}
              </div>
            )}
          </div>
        )}

        {/* Selected GRN Info */}
        {selectedGRN && !showGRNSelector && (
          <div
            style={{
              marginBottom: '32px',
              padding: '20px',
              background: '#f0f9ff',
              border: '2px solid #0ea5e9',
              borderRadius: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#0c4a6e',
                  }}
                >
                  Selected GRN: {selectedGRN.grn_number}
                </h4>
                <p style={{ margin: '0 0 4px 0', color: '#075985', fontSize: '14px' }}>
                  Supplier: {selectedGRN.supplier_name} | Received:{' '}
                  {new Date(selectedGRN.received_date).toLocaleDateString()}
                </p>
                <p style={{ margin: 0, color: '#075985', fontSize: '14px' }}>
                  Total Value: ₦{parseFloat(selectedGRN.total_amount).toLocaleString()} | Items:{' '}
                  {selectedGRN.items.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGRNSelector(true)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #0ea5e9',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#0ea5e9',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Change GRN
              </button>
            </div>
          </div>
        )}

        {/* Return Information */}
        {formData.grn_id && (
          <div style={{ display: 'grid', gap: '32px' }}>
            {/* Basic Return Information */}
            <div
              style={{
                padding: '24px',
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
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
                <FileText size={20} />
                Return Information
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '20px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                    }}
                  >
                    Return Date *
                  </label>
                  <input
                    type="date"
                    value={formData.return_date}
                    onChange={e => handleInputChange('return_date', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${errors.return_date ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                  {errors.return_date && (
                    <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                      {errors.return_date}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                    }}
                  >
                    Return Reason *
                  </label>
                  <select
                    value={formData.return_reason}
                    onChange={e => handleInputChange('return_reason', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="damaged">Damaged</option>
                    <option value="wrong_item">Wrong Item</option>
                    <option value="defective">Defective</option>
                    <option value="excess">Excess</option>
                    <option value="quality">Quality Issue</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                    }}
                  >
                    Refund Method *
                  </label>
                  <select
                    value={formData.refund_method}
                    onChange={e => handleInputChange('refund_method', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="credit_note">Credit Note</option>
                    <option value="cash">Cash Refund</option>
                    <option value="replacement">Replacement</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes about this return..."
                  rows={4}
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
            </div>

            {/* Return Items */}
            <div
              style={{
                padding: '24px',
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Package size={20} />
                  Return Items
                </h3>
                <button
                  type="button"
                  onClick={addReturnItem}
                  disabled={!selectedGRN}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    background: selectedGRN ? '#3b82f6' : '#9ca3af',
                    color: 'white',
                    cursor: selectedGRN ? 'pointer' : 'not-allowed',
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

              {errors.items && (
                <div
                  style={{
                    marginBottom: '16px',
                    color: '#ef4444',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <AlertCircle size={16} />
                  {errors.items}
                </div>
              )}

              {formData.items.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                  }}
                >
                  <Package size={48} style={{ margin: '0 auto 16px', color: '#d1d5db' }} />
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    No return items added yet. Select a GRN and add items to return.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {formData.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '20px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#fafafa',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '16px',
                        }}
                      >
                        <div>
                          <h4
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '16px',
                              fontWeight: 600,
                              color: '#1f2937',
                            }}
                          >
                            {item.item_name}
                          </h4>
                          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                            SKU: {item.item_sku} | Received: {item.quantity_received}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReturnItem(index)}
                          style={{
                            padding: '4px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#ef4444',
                            color: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <Minus size={16} />
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Quantity to Return *
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity_received}
                            step="0.01"
                            value={item.quantity_returned}
                            onChange={e =>
                              handleItemChange(
                                index,
                                'quantity_returned',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: `2px solid ${errors[`item_${index}_quantity`] ? '#ef4444' : '#e5e7eb'}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                          {errors[`item_${index}_quantity`] && (
                            <div style={{ marginTop: '2px', color: '#ef4444', fontSize: '11px' }}>
                              {errors[`item_${index}_quantity`]}
                            </div>
                          )}
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Return Reason *
                          </label>
                          <input
                            type="text"
                            value={item.return_reason}
                            onChange={e => handleItemChange(index, 'return_reason', e.target.value)}
                            placeholder="Reason for returning this item"
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: `2px solid ${errors[`item_${index}_reason`] ? '#ef4444' : '#e5e7eb'}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                          {errors[`item_${index}_reason`] && (
                            <div style={{ marginTop: '2px', color: '#ef4444', fontSize: '11px' }}>
                              {errors[`item_${index}_reason`]}
                            </div>
                          )}
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Condition
                          </label>
                          <select
                            value={item.condition}
                            onChange={e => handleItemChange(index, 'condition', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '2px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          >
                            <option value="good">Good</option>
                            <option value="damaged">Damaged</option>
                            <option value="defective">Defective</option>
                            <option value="expired">Expired</option>
                            <option value="wrong_item">Wrong Item</option>
                          </select>
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Return Value
                          </label>
                          <input
                            type="text"
                            value={`₦${parseFloat(item.return_cost || '0').toLocaleString()}`}
                            readOnly
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '2px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '14px',
                              background: '#f9fafb',
                              color: '#6b7280',
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: '16px' }}>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '4px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#374151',
                          }}
                        >
                          Item Notes
                        </label>
                        <textarea
                          value={item.notes}
                          onChange={e => handleItemChange(index, 'notes', e.target.value)}
                          placeholder="Additional notes for this item..."
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '2px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '14px',
                            resize: 'vertical',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total Return Value */}
              {formData.items.length > 0 && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: '#f0f9ff',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e40af' }}>
                      Total Return Value:
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>
                      ₦{calculateTotalReturnValue().toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div
              style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'flex-end',
                paddingTop: '24px',
                borderTop: '2px solid #e5e7eb',
              }}
            >
              <button
                type="button"
                onClick={() => navigate('/procurement/returns')}
                style={{
                  padding: '12px 24px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: isSubmitting ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Save size={16} />
                {isSubmitting ? 'Saving...' : isEditing ? 'Update Return' : 'Create Return'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default ReturnFormPage;
