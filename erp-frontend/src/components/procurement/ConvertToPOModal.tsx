import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingCart,
  Building,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  useAllProcurementSuppliers,
  useAllInventoryLocations,
} from '../../hooks/useProcurement';
import { PurchaseRequisition, Supplier, Location } from '../../types/procurement';

interface ConvertToPOModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (conversionData: {
    supplier: number;
    delivery_location: number;
    expected_delivery_date: string;
    order_date?: string;
    payment_terms?: string;
    custom_payment_terms?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    notes?: string;
  }) => void;
  requisition: PurchaseRequisition;
  isLoading?: boolean;
}

const ConvertToPOModal: React.FC<ConvertToPOModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  requisition,
  isLoading = false,
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState<string>('net_30');
  const [customPaymentTerms, setCustomPaymentTerms] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch suppliers and locations
  const { data: suppliers = [], isLoading: loadingSuppliers } = useAllProcurementSuppliers({
    ordering: 'name',
  });
  const { data: locations = [], isLoading: loadingLocations } = useAllInventoryLocations({
    is_active: true,
  });

  // Set default values and pre-populate from requisition data
  useEffect(() => {
    if (requisition && isOpen) {
      // Set expected delivery date from requisition required_by_date
      if (requisition.required_by_date && !expectedDeliveryDate) {
        setExpectedDeliveryDate(requisition.required_by_date);
      }

      // Set order date from requisition request_date
      if (requisition.request_date) {
        setOrderDate(requisition.request_date);
      }

      // Pre-populate notes from requisition
      if (requisition.notes && !notes) {
        setNotes(`From Requisition: ${requisition.notes}`);
      }
    }
  }, [requisition, isOpen, expectedDeliveryDate, notes]);

  // Auto-populate supplier fields when supplier is selected
  useEffect(() => {
    if (selectedSupplier && suppliers.length > 0) {
      const supplier = suppliers.find((s: Supplier) => s.id === selectedSupplier);
      if (supplier) {
        setPaymentTerms(supplier.payment_terms || 'net_30');
        setContactPerson(supplier.contact_person || '');
        setContactPhone(supplier.phone || '');
        setContactEmail(supplier.email || '');

        // Clear custom payment terms if switching to a standard payment term
        if (supplier.payment_terms !== 'custom') {
          setCustomPaymentTerms('');
        }
      }
    }
  }, [selectedSupplier, suppliers]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedSupplier(null);
      setSelectedLocation(null);
      setExpectedDeliveryDate(requisition?.required_by_date || '');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setPaymentTerms('net_30');
      setCustomPaymentTerms('');
      setContactPerson('');
      setContactPhone('');
      setContactEmail('');
      setNotes('');
      setErrors({});
    }
  }, [isOpen, requisition?.required_by_date]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedSupplier) {
      newErrors.supplier = 'Please select a supplier';
    }

    if (!selectedLocation) {
      newErrors.location = 'Please select a delivery location';
    }

    if (!expectedDeliveryDate) {
      newErrors.deliveryDate = 'Please select an expected delivery date';
    } else {
      const today = new Date();
      const deliveryDate = new Date(expectedDeliveryDate);
      if (deliveryDate < today) {
        newErrors.deliveryDate = 'Delivery date cannot be in the past';
      }
    }

    // Validate custom payment terms if selected
    if (paymentTerms === 'custom' && !customPaymentTerms.trim()) {
      newErrors.customPaymentTerms = 'Please specify custom payment terms';
    }

    // Validate email format if provided
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      newErrors.contactEmail = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!validateForm()) {
      return;
    }

    const conversionData = {
      supplier: selectedSupplier!,
      delivery_location: selectedLocation!,
      expected_delivery_date: expectedDeliveryDate,
      order_date: orderDate,
      payment_terms: paymentTerms,
      ...(paymentTerms === 'custom' &&
        customPaymentTerms && { custom_payment_terms: customPaymentTerms }),
      ...(contactPerson && { contact_person: contactPerson }),
      ...(contactPhone && { contact_phone: contactPhone }),
      ...(contactEmail && { contact_email: contactEmail }),
      ...(notes && { notes: notes }),
    };

    onConfirm(conversionData);
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
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                backgroundColor: '#8b5cf6',
                borderRadius: '8px',
                color: 'white',
              }}
            >
              <ShoppingCart size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
              Convert to Purchase Order
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px',
              border: 'none',
              background: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              borderRadius: '6px',
              color: '#6b7280',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Requisition Summary */}
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle size={16} style={{ color: '#0369a1' }} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0369a1' }}>
              Requisition Summary
            </h4>
          </div>
          <div style={{ fontSize: '13px', color: '#0369a1', lineHeight: '1.5' }}>
            <strong>PR Number:</strong> {requisition.pr_number || `#${requisition.id}`}
            <br />
            <strong>Items:</strong> {requisition.items?.length || 0}
            <br />
            <strong>Total Value:</strong> ₦
            {parseFloat(requisition.estimated_total || '0').toLocaleString()}
            <br />
            <strong>Required By:</strong>{' '}
            {new Date(requisition.required_by_date).toLocaleDateString()}
          </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Supplier Selection */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <Building size={16} />
              Supplier *
            </label>
            <select
              value={selectedSupplier || ''}
              onChange={e => {
                setSelectedSupplier(e.target.value ? parseInt(e.target.value) : null);
                if (errors.supplier) {
                  setErrors(prev => ({ ...prev, supplier: '' }));
                }
              }}
              disabled={isLoading || loadingSuppliers}
              style={{
                width: '100%',
                padding: '12px',
                border: `1px solid ${errors.supplier ? '#ef4444' : '#d1d5db'}`,
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: isLoading || loadingSuppliers ? '#f9fafb' : 'white',
                cursor: isLoading || loadingSuppliers ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">
                {loadingSuppliers ? 'Loading suppliers...' : 'Select a supplier'}
              </option>
              {suppliers.map((supplier: Supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} - {supplier.supplier_code}
                </option>
              ))}
            </select>
            {errors.supplier && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                <AlertCircle size={12} />
                {errors.supplier}
              </div>
            )}
          </div>

          {/* Delivery Location Selection */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <MapPin size={16} />
              Delivery Location *
            </label>
            <select
              value={selectedLocation || ''}
              onChange={e => {
                setSelectedLocation(e.target.value ? parseInt(e.target.value) : null);
                if (errors.location) {
                  setErrors(prev => ({ ...prev, location: '' }));
                }
              }}
              disabled={isLoading || loadingLocations}
              style={{
                width: '100%',
                padding: '12px',
                border: `1px solid ${errors.location ? '#ef4444' : '#d1d5db'}`,
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: isLoading || loadingLocations ? '#f9fafb' : 'white',
                cursor: isLoading || loadingLocations ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">
                {loadingLocations ? 'Loading locations...' : 'Select a delivery location'}
              </option>
              {locations.map((location: Location) => (
                <option key={location.id} value={location.id}>
                  {location.name} {location.code && `(${location.code})`}
                </option>
              ))}
            </select>
            {errors.location && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                <AlertCircle size={12} />
                {errors.location}
              </div>
            )}
          </div>

          {/* Expected Delivery Date */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <Calendar size={16} />
              Expected Delivery Date *
            </label>
            <input
              type="date"
              value={expectedDeliveryDate}
              onChange={e => {
                setExpectedDeliveryDate(e.target.value);
                if (errors.deliveryDate) {
                  setErrors(prev => ({ ...prev, deliveryDate: '' }));
                }
              }}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                border: `1px solid ${errors.deliveryDate ? '#ef4444' : '#d1d5db'}`,
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: isLoading ? '#f9fafb' : 'white',
                cursor: isLoading ? 'not-allowed' : 'text',
              }}
            />
            {errors.deliveryDate && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                <AlertCircle size={12} />
                {errors.deliveryDate}
              </div>
            )}
          </div>

          {/* Order Date */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <Calendar size={16} />
              Order Date
            </label>
            <input
              type="date"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: isLoading ? '#f9fafb' : 'white',
                cursor: isLoading ? 'not-allowed' : 'text',
              }}
            />
          </div>

          {/* Hidden Payment Terms - auto-populated from supplier */}
          <div style={{ display: 'none' }}>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="net_15">Net 15</option>
              <option value="net_30">Net 30</option>
              <option value="net_60">Net 60</option>
              <option value="net_90">Net 90</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Hidden Custom Payment Terms - auto-populated from supplier */}
          <div style={{ display: 'none' }}>
            <textarea
              value={customPaymentTerms}
              onChange={e => setCustomPaymentTerms(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Hidden Contact Person - auto-populated from supplier */}
          <div style={{ display: 'none' }}>
            <input
              type="text"
              value={contactPerson}
              onChange={e => setContactPerson(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Hidden Contact Phone - auto-populated from supplier */}
          <div style={{ display: 'none' }}>
            <input
              type="tel"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              maxLength={20}
            />
          </div>

          {/* Hidden Contact Email - auto-populated from supplier */}
          <div style={{ display: 'none' }}>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isLoading}
              placeholder="Additional notes for the purchase order..."
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: isLoading ? '#f9fafb' : 'white',
                cursor: isLoading ? 'not-allowed' : 'text',
                minHeight: '80px',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '32px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '12px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={isLoading || loadingSuppliers || loadingLocations}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              background: isLoading ? '#9ca3af' : '#8b5cf6',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Converting...
              </>
            ) : (
              <>
                <ShoppingCart size={16} />
                Convert to PO
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConvertToPOModal;
