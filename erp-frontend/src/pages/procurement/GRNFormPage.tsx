import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Package,
  Truck,
  User,
  Calendar,
  Clock,
  Camera,
  Plus,
  Minus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Upload,
  FileText,
  Scale,
  Thermometer,
  Ruler,
  Hash,
  Barcode,
  Building,
  Phone,
  Mail,
  MapPin,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  usePurchaseOrders,
  usePurchaseOrder,
  useCreateGRN,
  useUpdateGRN,
  useGRN,
  useAllInventoryLocations,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import {
  CreateGRNData,
  GoodsReceivedNote,
  PurchaseOrder,
  PurchaseOrderItem,
} from '../../services/procurementService';

interface GRNFormData {
  purchase_order_id: number | null;
  received_date: string;
  received_time: string;
  received_location: number | null;
  delivery_note_number: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string;
  supplier_invoice_amount: string;
  quality_status: 'pending' | 'passed' | 'failed' | 'partial';
  inspection_notes: string;
  notes: string;
  items: GRNItemFormData[];
}

interface GRNItemFormData {
  item: number;
  po_item: number | null;
  quantity_ordered: string;
  quantity_received: string;
  quantity_accepted: string;
  quantity_rejected: string;
  unit_cost: string;
  total_cost: string;
  batch_number: string;
  serial_number: string;
  expiry_date: string;
  condition_notes: string;
  rejection_reason: string;
}

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const GRNFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const isEditing = !!id;

  // Get PO ID from URL parameters
  const urlPOId = searchParams.get('po');
  const preselectedPOId = urlPOId ? parseInt(urlPOId) : null;

  // State for PO list pagination and search
  const [poSearchQuery, setPOSearchQuery] = useState('');
  const [poCurrentPage, setPOCurrentPage] = useState(1);
  const [poPageSize] = useState(10); // Items per page

  // State
  const [formData, setFormData] = useState<GRNFormData>({
    purchase_order_id: preselectedPOId, // Set from URL if available
    received_date: new Date().toISOString().split('T')[0],
    received_time: new Date().toTimeString().slice(0, 5),
    received_location: null,
    delivery_note_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    supplier_invoice_number: '',
    supplier_invoice_date: '',
    supplier_invoice_amount: '',
    quality_status: 'pending',
    inspection_notes: '',
    notes: '',
    items: [],
  });

  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showPOSelector, setShowPOSelector] = useState(!isEditing && !preselectedPOId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // React Query hooks - Modified to handle different scenarios
  const { data: purchaseOrdersData, isLoading: loadingPOs } = usePurchaseOrders({
    status: 'approved', // Only fetch approved POs for GRN creation
    search: poSearchQuery || undefined,
    page: poCurrentPage,
    ordering: '-created_at',
  });

  // Fetch specific PO if preselected or selected
  const { data: selectedPOData } = usePurchaseOrder(
    formData.purchase_order_id || 0,
    !!formData.purchase_order_id
  );

  useEffect(() => {
    console.log('selcted PO', selectedPOData);
  }, [selectedPO]);

  const { data: existingGRN, isLoading: loadingGRN } = useGRN(parseInt(id || '0'), isEditing);

  const { data: locationsData } = useAllInventoryLocations({
    is_active: true,
  });

  // Mutations
  const createGRNMutation = useCreateGRN();
  const updateGRNMutation = useUpdateGRN();

  const purchaseOrders = purchaseOrdersData?.results || [];
  const locations = locationsData || [];

  // Initialize form data for editing existing GRN
  useEffect(() => {
    if (isEditing && existingGRN) {
      console.log('📝 Loading existing GRN for editing:', existingGRN);

      setFormData({
        purchase_order_id: existingGRN.purchase_order,
        received_date: existingGRN.received_date,
        received_time: existingGRN.received_time,
        received_location: existingGRN.received_location,
        delivery_note_number: existingGRN.delivery_note_number || '',
        vehicle_number: existingGRN.vehicle_number || '',
        driver_name: existingGRN.driver_name || '',
        driver_phone: existingGRN.driver_phone || '',
        supplier_invoice_number: existingGRN.supplier_invoice_number || '',
        supplier_invoice_date: existingGRN.supplier_invoice_date || '',
        supplier_invoice_amount: existingGRN.supplier_invoice_amount || '',
        quality_status: existingGRN.quality_status,
        inspection_notes: existingGRN.inspection_notes || '',
        notes: existingGRN.notes || '',
        items: (existingGRN.items || []).map(item => ({
          item: item.item,
          po_item: item.po_item,
          quantity_ordered: item.quantity_ordered,
          quantity_received: item.quantity_received,
          quantity_accepted: item.quantity_accepted,
          quantity_rejected: item.quantity_rejected,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          batch_number: item.batch_number || '',
          serial_number: item.serial_number || '',
          expiry_date: item.expiry_date || '',
          condition_notes: item.condition_notes || '',
          rejection_reason: item.rejection_reason || '',
        })),
      });

      // Set the selected PO data if we have it
      if (existingGRN.purchase_order) {
        // The PO data should be loaded via the selectedPOData hook
        setShowPOSelector(false);
      }
    }
  }, [isEditing, existingGRN]);

  // Initialize form data for editing
  // Update selected PO when detailed PO data is loaded
  useEffect(() => {
    if (selectedPOData) {
      console.log('🔍 Detailed PO Data loaded:', selectedPOData);
      console.log('🔍 Detailed PO has items?', !!selectedPOData.items);
      console.log('🔍 Items count:', selectedPOData.items?.length);

      setSelectedPO(selectedPOData);

      // Only populate items for NEW GRN (not editing) and if we don't have items yet
      if (!isEditing && formData.items.length === 0 && selectedPOData.items) {
        console.log('📦 Populating form with items from detailed PO');

        setFormData(prev => ({
          ...prev,
          items: (selectedPOData.items || []).map(poItem => ({
            item: poItem.item, // This is the item ID (number), not the object
            po_item: poItem.id,
            quantity_ordered: poItem.quantity.toString(),
            quantity_received: '0',
            quantity_accepted: '0',
            quantity_rejected: '0',
            unit_cost: poItem.unit_price.toString(),
            total_cost: '0',
            batch_number: '',
            serial_number: '',
            expiry_date: '',
            condition_notes: '',
            rejection_reason: '',
          })),
        }));
      }
    }
  }, [selectedPOData, isEditing, formData.items.length]);
  // Update selected PO when PO data is loaded
  useEffect(() => {
    if (selectedPOData) {
      setSelectedPO(selectedPOData);
    }
  }, [selectedPOData]);

  // Handle PO selection
  // Handle PO selection
  const handlePOSelection = (po: PurchaseOrder) => {
    // Only set the purchase_order_id, don't set selectedPO yet
    setFormData(prev => ({
      ...prev,
      purchase_order_id: po.id,
      // Don't set items here - they'll come from selectedPOData
      items: [], // Clear items, they'll be populated when selectedPOData loads
    }));

    // Don't set selectedPO here - it will be set by the useEffect when selectedPOData loads
    // setSelectedPO(po); // REMOVE THIS LINE

    setShowPOSelector(false);
  };
  // Handle form field changes
  const handleFieldChange = (field: keyof GRNFormData, value: any) => {
    if (field === 'supplier_invoice_amount' && typeof value === 'string' && !isValidDecimalInput(value)) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when field is updated
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  // Handle item field changes
  const handleItemChange = (index: number, field: keyof GRNItemFormData, value: any) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      const item = { ...updatedItems[index] };

      // Update the field
      item[field] = value;

      // Handle quantity calculations
      if (field === 'quantity_received') {
        // When received quantity changes, default to accepting all
        item.quantity_accepted = value;
        item.quantity_rejected = '0';
        item.total_cost = (parseFloat(value || '0') * parseFloat(item.unit_cost || '0')).toString();
      } else if (field === 'quantity_accepted') {
        // When accepted quantity changes, calculate rejected
        const received = parseFloat(item.quantity_received || '0');
        const accepted = parseFloat(value || '0');
        item.quantity_rejected = Math.max(0, received - accepted).toString();
        item.total_cost = (accepted * parseFloat(item.unit_cost || '0')).toString();
      } else if (field === 'quantity_rejected') {
        // When rejected quantity changes, calculate accepted
        const received = parseFloat(item.quantity_received || '0');
        const rejected = parseFloat(value || '0');
        item.quantity_accepted = Math.max(0, received - rejected).toString();
        item.total_cost = (
          parseFloat(item.quantity_accepted || '0') * parseFloat(item.unit_cost || '0')
        ).toString();
      } else if (field === 'unit_cost') {
        // Recalculate total cost when unit cost changes
        item.total_cost = (
          parseFloat(item.quantity_accepted || '0') * parseFloat(value || '0')
        ).toString();
      }

      updatedItems[index] = item;

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };
  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.purchase_order_id) {
      newErrors.purchase_order_id = 'Purchase order selection is required';
    }

    if (!formData.received_date) {
      newErrors.received_date = 'Received date is required';
    }

    if (!formData.received_time) {
      newErrors.received_time = 'Received time is required';
    }

    if (!formData.received_location) {
      newErrors.received_location = 'Received location is required';
    }

    if (formData.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }

    // Validate items
    formData.items.forEach((item, index) => {
      if (parseFloat(item.quantity_received) <= 0) {
        newErrors[`item_${index}_quantity_received`] = 'Quantity received must be greater than 0';
      }

      if (parseFloat(item.quantity_accepted) < 0) {
        newErrors[`item_${index}_quantity_accepted`] = 'Quantity accepted cannot be negative';
      }

      if (parseFloat(item.quantity_rejected) < 0) {
        newErrors[`item_${index}_quantity_rejected`] = 'Quantity rejected cannot be negative';
      }

      if (
        parseFloat(item.quantity_accepted) + parseFloat(item.quantity_rejected) !==
        parseFloat(item.quantity_received)
      ) {
        newErrors[`item_${index}_quantities`] = 'Accepted + Rejected must equal Received quantity';
      }

      if (parseFloat(item.quantity_rejected) > 0 && !item.rejection_reason.trim()) {
        newErrors[`item_${index}_rejection_reason`] =
          'Rejection reason required when rejecting items';
      }

      if (!item.unit_cost || parseFloat(item.unit_cost) <= 0) {
        newErrors[`item_${index}_unit_cost`] = 'Unit cost is required and must be greater than 0';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== GRN FORM SUBMISSION START ===');
    console.log('Form Data:', formData);
    console.log('Selected PO:', selectedPO);

    // VALIDATION DISABLED FOR TESTING - REMOVE WHEN DONE
    console.log('⚠️ VALIDATION DISABLED FOR TESTING');
    console.log('Form validation bypassed to test API payload');
    setIsSubmitting(true);

    try {
      // Calculate total amount
      const totalAmount = formData.items
        .reduce((sum, item) => sum + parseFloat(item.total_cost || '0'), 0)
        .toString();

      console.log('💰 Calculated total amount:', totalAmount);

      const submitData: CreateGRNData = {
        purchase_order: formData.purchase_order_id,
        supplier: selectedPO?.supplier || 0,
        received_date: formData.received_date,
        received_time: formData.received_time,
        received_location: formData.received_location!,
        delivery_note_number: formData.delivery_note_number,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        driver_phone: formData.driver_phone,
        supplier_invoice_number: formData.supplier_invoice_number,
        supplier_invoice_date: formData.supplier_invoice_date || null,
        supplier_invoice_amount: formData.supplier_invoice_amount || null,
        quality_status: formData.quality_status,
        inspection_notes: formData.inspection_notes,
        total_amount: totalAmount,
        notes: formData.notes,
        items: formData.items.map(item => ({
          item: item.item,
          po_item: item.po_item,
          quantity_ordered: item.quantity_ordered,
          quantity_received: item.quantity_received,
          quantity_accepted: item.quantity_accepted,
          quantity_rejected: item.quantity_rejected,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          batch_number: item.batch_number,
          serial_number: item.serial_number,
          expiry_date: item.expiry_date || null,
          condition_notes: item.condition_notes,
          rejection_reason: item.rejection_reason,
        })),
      };

      console.log('📦 FINAL PAYLOAD TO API:');
      console.log(JSON.stringify(submitData, null, 2));

      if (isEditing) {
        console.log('🔄 Updating existing GRN with ID:', id);
        const result = await updateGRNMutation.mutateAsync({
          id: parseInt(id!),
          data: submitData,
        });
        console.log('✅ Update successful:', result);
        toast.success('GRN updated successfully!');
      } else {
        console.log('🆕 Creating new GRN');
        const result = await createGRNMutation.mutateAsync(submitData);
        console.log('✅ Creation successful:', result);
        toast.success('GRN created successfully!');
      }

      console.log('🎉 GRN submission completed successfully');
      navigate('/procurement/grn');
    } catch (error: any) {
      console.log('❌ GRN SUBMISSION ERROR:');
      console.error('Full error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error response:', error?.response);
      console.error('Error response data:', error?.response?.data);
      console.error('Error response status:', error?.response?.status);
      console.error('Error response headers:', error?.response?.headers);

      // Log validation errors if they exist
      if (error?.response?.data?.errors) {
        console.log('🔍 API Validation Errors:');
        console.log(JSON.stringify(error.response.data.errors, null, 2));
      }

      // Log field-specific errors
      if (error?.response?.data) {
        console.log('🔍 API Response Data:');
        console.log(JSON.stringify(error.response.data, null, 2));
      }

      toast.error(error?.response?.data?.message || error?.message || 'Failed to save GRN');
    } finally {
      setIsSubmitting(false);
      console.log('=== GRN FORM SUBMISSION END ===');
    }
  };

  if (loadingGRN) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading GRN...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/procurement/grn')}
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
              {isEditing ? 'Edit Goods Received Note' : 'Create Goods Received Note'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing
                ? 'Update goods receipt information and quality inspection details'
                : 'Record goods receipt against purchase order with quality inspection'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Purchase Order Selection */}
        {showPOSelector && (
          <div
            style={{
              marginBottom: '32px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={20} />
              Select Purchase Order (Approved Orders Only)
            </h2>

            {errors.purchase_order_id && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '14px',
                }}
              >
                {errors.purchase_order_id}
              </div>
            )}

            {/* Search and Pagination Controls */}
            <div
              style={{
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
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
                  placeholder="Search by PO number or supplier..."
                  value={poSearchQuery}
                  onChange={e => {
                    setPOSearchQuery(e.target.value);
                    setPOCurrentPage(1); // Reset to first page on search
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 40px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {purchaseOrdersData?.count || 0} approved orders
              </div>
            </div>

            {loadingPOs ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                Loading approved purchase orders...
              </div>
            ) : purchaseOrders.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <Package size={48} style={{ margin: '0 auto 16px', color: '#d1d5db' }} />
                <p style={{ margin: 0, color: '#6b7280' }}>
                  {poSearchQuery
                    ? `No approved purchase orders found matching "${poSearchQuery}"`
                    : 'No approved purchase orders available for goods receipt'}
                </p>
              </div>
            ) : (
              <>
                {/* PO List with shorter rows */}
                <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
                  {purchaseOrders.map(po => (
                    <div
                      key={po.id}
                      onClick={() => handlePOSelection(po)}
                      style={{
                        padding: '12px 16px', // Reduced padding for shorter rows
                        border: '1px solid #e5e7eb', // Thinner border
                        borderRadius: '6px', // Smaller border radius
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        background: 'white',
                        minHeight: '60px', // Set minimum height for consistency
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              marginBottom: '4px',
                            }}
                          >
                            <h3
                              style={{
                                margin: 0,
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#1f2937',
                              }}
                            >
                              {po.po_number}
                            </h3>
                            <span
                              style={{
                                fontSize: '12px',
                                color: '#10b981',
                                background: '#dcfce7',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: 500,
                              }}
                            >
                              Approved
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: '16px',
                              fontSize: '13px',
                              color: '#6b7280',
                            }}
                          >
                            <span>
                              <strong>Supplier:</strong> {po.supplier_name}
                            </span>
                            <span>
                              <strong>Date:</strong> {new Date(po.created_at).toLocaleDateString()}
                            </span>
                            <span>
                              <strong>Received:</strong> {po.received_percentage}%
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: '16px' }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937' }}>
                            ₦{parseFloat(po.total_amount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {purchaseOrdersData && purchaseOrdersData.count > poPageSize && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      Showing {(poCurrentPage - 1) * poPageSize + 1} to{' '}
                      {Math.min(poCurrentPage * poPageSize, purchaseOrdersData.count)} of{' '}
                      {purchaseOrdersData.count} orders
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setPOCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={poCurrentPage === 1}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          background: poCurrentPage === 1 ? '#f9fafb' : 'white',
                          color: poCurrentPage === 1 ? '#9ca3af' : '#374151',
                          cursor: poCurrentPage === 1 ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ChevronLeft size={16} />
                        Previous
                      </button>
                      <span style={{ fontSize: '14px', color: '#374151', padding: '0 8px' }}>
                        Page {poCurrentPage} of {Math.ceil(purchaseOrdersData.count / poPageSize)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPOCurrentPage(prev => prev + 1)}
                        disabled={poCurrentPage >= Math.ceil(purchaseOrdersData.count / poPageSize)}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          background:
                            poCurrentPage >= Math.ceil(purchaseOrdersData.count / poPageSize)
                              ? '#f9fafb'
                              : 'white',
                          color:
                            poCurrentPage >= Math.ceil(purchaseOrdersData.count / poPageSize)
                              ? '#9ca3af'
                              : '#374151',
                          cursor:
                            poCurrentPage >= Math.ceil(purchaseOrdersData.count / poPageSize)
                              ? 'not-allowed'
                              : 'pointer',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Next
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* Selected PO Summary */}
        {selectedPO && !showPOSelector && (
          <div
            style={{
              marginBottom: '32px',
              background: '#f0f9ff',
              border: '2px solid #0ea5e9',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#0c4a6e',
                  }}
                >
                  Purchase Order: {selectedPO.po_number}
                </h3>
                <p style={{ margin: '0 0 4px 0', color: '#0369a1', fontSize: '14px' }}>
                  <strong>Supplier:</strong> {selectedPO.supplier_name}
                </p>
                <p style={{ margin: '0 0 4px 0', color: '#0369a1', fontSize: '14px' }}>
                  <strong>Order Date:</strong>{' '}
                  {new Date(selectedPO.order_date).toLocaleDateString()}
                </p>
                <p style={{ margin: 0, color: '#0369a1', fontSize: '14px' }}>
                  <strong>Expected Delivery:</strong>{' '}
                  {selectedPO.expected_delivery_date
                    ? new Date(selectedPO.expected_delivery_date).toLocaleDateString()
                    : 'Not specified'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0c4a6e' }}>
                  ₦{parseFloat(selectedPO.total_amount).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPOSelector(true)}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    border: '1px solid #0ea5e9',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#0369a1',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Change PO
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Information */}
        {selectedPO && !showPOSelector && (
          <div
            style={{
              marginBottom: '32px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2
              style={{
                margin: '0 0 20px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Truck size={20} />
              Delivery Information
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Basic Delivery Info */}
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
                  <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Received Date *
                </label>
                <input
                  type="date"
                  value={formData.received_date}
                  onChange={e => handleFieldChange('received_date', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.received_date ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
                {errors.received_date && (
                  <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                    {errors.received_date}
                  </div>
                )}
              </div>

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
                  <Clock size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Received Time *
                </label>
                <input
                  type="time"
                  value={formData.received_time}
                  onChange={e => handleFieldChange('received_time', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.received_time ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
                {errors.received_time && (
                  <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                    {errors.received_time}
                  </div>
                )}
              </div>

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
                  <Building size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Received Location *
                </label>
                <select
                  value={formData.received_location || ''}
                  onChange={e =>
                    handleFieldChange('received_location', parseInt(e.target.value) || null)
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${errors.received_location ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select location...</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.code})
                    </option>
                  ))}
                </select>
                {errors.received_location && (
                  <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                    {errors.received_location}
                  </div>
                )}
              </div>

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
                  <FileText size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Delivery Note Number
                </label>
                <input
                  type="text"
                  value={formData.delivery_note_number}
                  onChange={e => handleFieldChange('delivery_note_number', e.target.value)}
                  placeholder="Enter delivery note number..."
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
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  <Truck size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={formData.vehicle_number}
                  onChange={e => handleFieldChange('vehicle_number', e.target.value)}
                  placeholder="Enter vehicle number..."
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
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  <User size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Driver Name
                </label>
                <input
                  type="text"
                  value={formData.driver_name}
                  onChange={e => handleFieldChange('driver_name', e.target.value)}
                  placeholder="Enter driver name..."
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
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  <Phone size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Driver Phone
                </label>
                <input
                  type="tel"
                  value={formData.driver_phone}
                  onChange={e => handleFieldChange('driver_phone', e.target.value)}
                  placeholder="Enter driver phone..."
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
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  <FileText size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Supplier Invoice Number
                </label>
                <input
                  type="text"
                  value={formData.supplier_invoice_number}
                  onChange={e => handleFieldChange('supplier_invoice_number', e.target.value)}
                  placeholder="Enter supplier invoice number..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>
          </div>
        )}
        {/* Items Section - REQUIRED */}
        {selectedPO && !showPOSelector && formData.items.length > 0 && (
          <div
            style={{
              marginBottom: '32px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2
              style={{
                margin: '0 0 20px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={20} />
              Items Received ({formData.items.length})
            </h2>

            {errors.items && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '14px',
                }}
              >
                {errors.items}
              </div>
            )}

            <div style={{ display: 'grid', gap: '24px' }}>
              {formData.items.map((item, index) => {
                // Find the matching PO item by comparing item IDs
                const poItem = selectedPO.items.find(pi => pi.item === item.item);
                if (!poItem) return null;

                const pendingQty = poItem.quantity - poItem.quantity_received;

                return (
                  <div
                    key={index}
                    style={{
                      border: '2px solid #f3f4f6',
                      borderRadius: '12px',
                      padding: '20px',
                      background: '#fafafa',
                    }}
                  >
                    {/* Item Header */}
                    <div
                      style={{
                        marginBottom: '16px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <h3
                        style={{
                          margin: '0 0 8px 0',
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#1f2937',
                        }}
                      >
                        {poItem.item_name} {/* Use item_name from PO item */}
                      </h3>
                      <div
                        style={{
                          display: 'flex',
                          gap: '16px',
                          flexWrap: 'wrap',
                          fontSize: '14px',
                          color: '#6b7280',
                        }}
                      >
                        <span>
                          <strong>SKU:</strong> {poItem.item_sku}
                        </span>
                        <span>
                          <strong>Ordered:</strong> {poItem.quantity}
                        </span>
                        <span>
                          <strong>Pending:</strong> {pendingQty}
                        </span>
                        <span>
                          <strong>Unit Price:</strong> ₦
                          {parseFloat(item.unit_cost).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* REQUIRED: Quantity Received */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                        }}
                      >
                        Quantity Received *
                        <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                          (Max: {pendingQty})
                        </span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={pendingQty}
                        step="0.01"
                        value={item.quantity_received}
                        onChange={e => handleItemChange(index, 'quantity_received', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: `2px solid ${errors[`item_${index}_quantity_received`] ? '#ef4444' : '#d1d5db'}`,
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      />
                      {errors[`item_${index}_quantity_received`] && (
                        <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                          {errors[`item_${index}_quantity_received`]}
                        </div>
                      )}
                    </div>

                    {/* Editable Quantities */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '16px',
                        marginBottom: '16px',
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
                          Quantity Accepted *
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity_received || 0}
                          step="0.01"
                          value={item.quantity_accepted}
                          onChange={e =>
                            handleItemChange(index, 'quantity_accepted', e.target.value)
                          }
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: `2px solid ${errors[`item_${index}_quantity_accepted`] ? '#ef4444' : '#d1d5db'}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                          }}
                        />
                        {errors[`item_${index}_quantity_accepted`] && (
                          <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                            {errors[`item_${index}_quantity_accepted`]}
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
                          Quantity Rejected
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity_received || 0}
                          step="0.01"
                          value={item.quantity_rejected}
                          onChange={e =>
                            handleItemChange(index, 'quantity_rejected', e.target.value)
                          }
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: `2px solid ${errors[`item_${index}_quantity_rejected`] ? '#ef4444' : '#d1d5db'}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                          }}
                        />
                        {errors[`item_${index}_quantity_rejected`] && (
                          <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                            {errors[`item_${index}_quantity_rejected`]}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auto-calculated Cost */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '6px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                        }}
                      >
                        Total Cost (Auto-calculated)
                      </label>
                      <div
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          background: '#f9fafb',
                          fontWeight: 600,
                          color: '#1f2937',
                        }}
                      >
                        ₦{parseFloat(item.total_cost || '0').toLocaleString()}
                      </div>
                    </div>

                    {/* Optional Batch Info */}
                    <details
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <summary
                        style={{
                          padding: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Hash size={16} />
                          Optional: Batch/Serial Information
                        </span>
                      </summary>

                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px',
                          borderTop: '1px solid #e5e7eb',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '12px',
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '4px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#6b7280',
                              }}
                            >
                              Batch Number
                            </label>
                            <input
                              type="text"
                              value={item.batch_number}
                              onChange={e =>
                                handleItemChange(index, 'batch_number', e.target.value)
                              }
                              placeholder="Optional"
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px',
                              }}
                            />
                          </div>

                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '4px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#6b7280',
                              }}
                            >
                              Serial Number
                            </label>
                            <input
                              type="text"
                              value={item.serial_number}
                              onChange={e =>
                                handleItemChange(index, 'serial_number', e.target.value)
                              }
                              placeholder="Optional"
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px',
                              }}
                            />
                          </div>

                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '4px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#6b7280',
                              }}
                            >
                              Expiry Date
                            </label>
                            <input
                              type="date"
                              value={item.expiry_date}
                              onChange={e => handleItemChange(index, 'expiry_date', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </details>

                    {/* Condition Notes */}
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
                        Condition Notes
                      </label>
                      <textarea
                        value={item.condition_notes}
                        onChange={e => handleItemChange(index, 'condition_notes', e.target.value)}
                        placeholder="Optional condition notes..."
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                    {/* Add this after Condition Notes section */}
                    {parseFloat(item.quantity_rejected) > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '6px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#374151',
                          }}
                        >
                          Rejection Reason *
                        </label>
                        <textarea
                          value={item.rejection_reason}
                          onChange={e =>
                            handleItemChange(index, 'rejection_reason', e.target.value)
                          }
                          placeholder="Explain why items were rejected..."
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: `2px solid ${errors[`item_${index}_rejection_reason`] ? '#ef4444' : '#d1d5db'}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                            resize: 'vertical',
                          }}
                        />
                        {errors[`item_${index}_rejection_reason`] && (
                          <div style={{ marginTop: '4px', color: '#ef4444', fontSize: '12px' }}>
                            {errors[`item_${index}_rejection_reason`]}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Overall Notes Section */}
        {selectedPO && !showPOSelector && (
          <div
            style={{
              marginBottom: '32px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2
              style={{
                margin: '0 0 20px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FileText size={20} />
              Additional Information
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
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Overall Quality Status
                </label>
                <select
                  value={formData.quality_status}
                  onChange={e => handleFieldChange('quality_status', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="pending">Pending Inspection</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="partial">Partial (Some items rejected)</option>
                </select>
              </div>

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
                  Supplier Invoice Date
                </label>
                <input
                  type="date"
                  value={formData.supplier_invoice_date}
                  onChange={e => handleFieldChange('supplier_invoice_date', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Supplier Invoice Amount
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.supplier_invoice_amount}
                onChange={e => handleFieldChange('supplier_invoice_amount', e.target.value)}
                placeholder="Enter supplier invoice amount..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Overall Inspection Notes
              </label>
              <textarea
                value={formData.inspection_notes}
                onChange={e => handleFieldChange('inspection_notes', e.target.value)}
                placeholder="Enter overall inspection notes and observations..."
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
                onChange={e => handleFieldChange('notes', e.target.value)}
                placeholder="Enter any additional notes or comments..."
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

            {/* Placeholder Image Upload Section */}
            <div style={{ marginTop: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                <Camera size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Delivery Photos & Documents
              </label>
              <div
                style={{
                  border: '2px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  background: '#f9fafb',
                  color: '#6b7280',
                }}
              >
                <Upload size={32} style={{ margin: '0 auto 12px', color: '#9ca3af' }} />
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500 }}>
                  Image Upload Feature - Coming Soon
                </p>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  Upload photos of delivered goods, delivery notes, and invoices
                </p>
                <div
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '4px',
                    display: 'inline-block',
                    fontSize: '12px',
                    color: '#92400e',
                  }}
                >
                  📝 TODO: Implement image upload functionality
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        {selectedPO && !showPOSelector && (
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
              onClick={() => navigate('/procurement/grn')}
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
              {isSubmitting
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                  ? 'Update GRN'
                  : 'Create GRN'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default GRNFormPage;
