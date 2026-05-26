import React, { useState } from 'react';
import { X, ShoppingCart, MapPin, Calendar, User, Phone, Mail, FileText } from 'lucide-react';
import { Quote } from '../../types/quotes';
import { useAllInventoryLocations } from '../../hooks/useProcurement';

interface ConvertQuoteToPOModalProps {
  quote: Quote;
  isOpen: boolean;
  onClose: () => void;
  onConvert: (data: {
    supplier: number;
    delivery_location: number;
    expected_delivery_date: string;
    order_date: string;
    payment_terms: string;
    custom_payment_terms?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    notes?: string;
  }) => void;
}

const ConvertQuoteToPOModal: React.FC<ConvertQuoteToPOModalProps> = ({
  quote,
  isOpen,
  onClose,
  onConvert,
}) => {
  const { data: locations = [], isLoading: loadingLocations } = useAllInventoryLocations();

  const [formData, setFormData] = useState({
    supplier: quote.supplier,
    delivery_location: '',
    expected_delivery_date: '',
    order_date: new Date().toISOString().split('T')[0], // Default to today
    payment_terms: quote.payment_terms || 'net_30', // Use quote's payment terms or default
    custom_payment_terms: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.delivery_location) {
      newErrors.delivery_location = 'Delivery location is required';
    }

    if (!formData.expected_delivery_date) {
      newErrors.expected_delivery_date = 'Expected delivery date is required';
    } else {
      const selectedDate = new Date(formData.expected_delivery_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        newErrors.expected_delivery_date = 'Expected delivery date cannot be in the past';
      }
    }

    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      newErrors.contact_email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onConvert({
      supplier: formData.supplier,
      delivery_location: parseInt(formData.delivery_location),
      expected_delivery_date: formData.expected_delivery_date,
      order_date: formData.order_date,
      payment_terms: formData.payment_terms,
      custom_payment_terms: formData.custom_payment_terms || undefined,
      contact_person: formData.contact_person || undefined,
      contact_phone: formData.contact_phone || undefined,
      contact_email: formData.contact_email || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
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
          maxWidth: '600px',
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
              Convert Quote to Purchase Order
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              Quote from {quote.supplier_name} - ₦{parseFloat(quote.total_amount).toLocaleString()}
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
          {/* Quote Summary */}
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
              Quote Summary
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
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Quote Number: </span>
                <span style={{ color: '#1f2937' }}>{quote.quote_number}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Supplier: </span>
                <span style={{ color: '#1f2937' }}>{quote.supplier_name}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Total Amount: </span>
                <span style={{ color: '#1f2937', fontWeight: '600' }}>
                  ₦{parseFloat(quote.total_amount).toLocaleString()}
                </span>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Items: </span>
                <span style={{ color: '#1f2937' }}>{quote.items.length}</span>
              </div>
            </div>
          </div>

          {/* Delivery Location */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              <MapPin size={16} style={{ display: 'inline', marginRight: '8px' }} />
              Delivery Location *
            </label>
            {loadingLocations ? (
              <div style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
                Loading locations...
              </div>
            ) : (
              <select
                value={formData.delivery_location}
                onChange={e => handleInputChange('delivery_location', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: errors.delivery_location ? '1px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select delivery location</option>
                {locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name} - {location.address}
                  </option>
                ))}
              </select>
            )}
            {errors.delivery_location && (
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                {errors.delivery_location}
              </p>
            )}
          </div>

          {/* Order Date and Expected Delivery Date */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '20px',
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
                Order Date *
              </label>
              <input
                type="date"
                value={formData.order_date}
                onChange={e => handleInputChange('order_date', e.target.value)}
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
                <Calendar size={16} style={{ display: 'inline', marginRight: '8px' }} />
                Expected Delivery Date *
              </label>
              <input
                type="date"
                value={formData.expected_delivery_date}
                onChange={e => handleInputChange('expected_delivery_date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: errors.expected_delivery_date ? '1px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
              {errors.expected_delivery_date && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                  {errors.expected_delivery_date}
                </p>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Payment Terms *
            </label>
            <select
              value={formData.payment_terms}
              onChange={e => handleInputChange('payment_terms', e.target.value)}
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
              <option value="custom">Custom Terms</option>
            </select>
          </div>

          {/* Custom Payment Terms - Show only if "custom" is selected */}
          {formData.payment_terms === 'custom' && (
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px',
                }}
              >
                Custom Payment Terms *
              </label>
              <input
                type="text"
                value={formData.custom_payment_terms}
                onChange={e => handleInputChange('custom_payment_terms', e.target.value)}
                placeholder="Enter custom payment terms"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>
          )}

          {/* Contact Information */}
          <div style={{ marginBottom: '20px' }}>
            <h4
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
              }}
            >
              Contact Information (Optional)
            </h4>

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
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  <User size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={e => handleInputChange('contact_person', e.target.value)}
                  placeholder="Enter contact person name"
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
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  <Phone size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={e => handleInputChange('contact_phone', e.target.value)}
                  placeholder="Enter phone number"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px',
                }}
              >
                <Mail size={14} style={{ display: 'inline', marginRight: '6px' }} />
                Contact Email
              </label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={e => handleInputChange('contact_email', e.target.value)}
                placeholder="Enter email address"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: errors.contact_email ? '1px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              {errors.contact_email && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                  {errors.contact_email}
                </p>
              )}
            </div>
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
              onChange={e => handleInputChange('notes', e.target.value)}
              placeholder="Any additional instructions or notes for the purchase order..."
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: '#8b5cf6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ShoppingCart size={16} />
              Create Purchase Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConvertQuoteToPOModal;
