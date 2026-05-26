import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Camera,
  Upload,
  FileText,
  User,
  Calendar,
  Clock,
  Thermometer,
  Scale,
  Eye,
  Star,
} from 'lucide-react';

import { useGRN, useCompleteQualityInspection } from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { CreateGRNData } from '../../services/procurementService';

interface QualityCheckFormData {
  quality_status: 'pending' | 'passed' | 'failed' | 'partial';
  inspection_notes: string;
  inspected_by?: number;
  items: QualityCheckItemData[];
}

interface QualityCheckItemData {
  id: number;
  item_name: string;
  quantity_received: string;
  quantity_accepted: string;
  quantity_rejected: string;
  condition_rating: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  temperature_check?: string;
  visual_inspection: string;
  packaging_condition: 'intact' | 'damaged' | 'opened' | 'missing';
  expiry_check: 'valid' | 'near_expiry' | 'expired' | 'not_applicable';
  batch_verification: 'verified' | 'mismatch' | 'missing' | 'not_applicable';
  rejection_reason?: string;
  inspector_notes: string;
}

const GRNQualityCheckPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [formData, setFormData] = useState<QualityCheckFormData>({
    quality_status: 'pending',
    inspection_notes: '',
    items: [],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get current user for inspector assignment
  const { user } = useAuth();

  // React Query hooks
  const { data: grn, isLoading: loadingGRN } = useGRN(parseInt(id || '0'), !!id);

  const completeQualityInspectionMutation = useCompleteQualityInspection();

  // Initialize form data when GRN is loaded
  useEffect(() => {
    if (grn) {
      setFormData({
        quality_status: grn.quality_status,
        inspection_notes: grn.inspection_notes || '',
        items: (grn.items || []).map(item => ({
          id: item.id ?? item.item,
          item_name: item.item_name || `Item ${item.item}`,
          quantity_received: item.quantity_received,
          quantity_accepted: item.quantity_accepted,
          quantity_rejected: item.quantity_rejected,
          condition_rating: item.quality_data?.condition_rating || 'good',
          visual_inspection: item.quality_data?.visual_inspection || '',
          packaging_condition: item.quality_data?.packaging_condition || 'intact',
          expiry_check: item.quality_data?.expiry_check || 'not_applicable',
          batch_verification: item.quality_data?.batch_verification || 'not_applicable',
          temperature_check: item.quality_data?.temperature_check,
          rejection_reason: item.rejection_reason || '',
          inspector_notes: item.condition_notes || '',
        })),
      });
    }
  }, [grn]);

  const handleFieldChange = (field: keyof QualityCheckFormData, value: any) => {
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

  const handleItemChange = (index: number, field: keyof QualityCheckItemData, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const calculateOverallStatus = (): 'passed' | 'failed' | 'partial' => {
    const items = formData.items;
    if (items.length === 0) return 'passed';

    const hasRejected = items.some(item => parseFloat(item.quantity_rejected) > 0);
    const hasPoor = items.some(item => ['poor', 'damaged'].includes(item.condition_rating));

    if (hasRejected || hasPoor) {
      const allRejected = items.every(item => parseFloat(item.quantity_accepted) === 0);
      return allRejected ? 'failed' : 'partial';
    }

    return 'passed';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Calculate overall status based on item inspections
      const calculatedStatus = calculateOverallStatus();

      // Prepare inspection data for the inspect endpoint
      const inspectionData: Partial<CreateGRNData> = {
        quality_status: calculatedStatus,
        inspection_notes: formData.inspection_notes,
        inspected_by: user?.id || null, // Use current user ID or null if not available
        items: formData.items.map(qualityItem => {
          const originalItem = grn?.items.find(i => (i.id ?? i.item) === qualityItem.id);
          return {
            id: qualityItem.id,
            item: originalItem?.item ?? qualityItem.id,
            po_item: originalItem?.po_item || null,
            quantity_ordered: originalItem?.quantity_ordered || '0',
            quantity_received: qualityItem.quantity_received,
            quantity_accepted: qualityItem.quantity_accepted,
            quantity_rejected: qualityItem.quantity_rejected,
            unit_cost: originalItem?.unit_cost || '0',
            total_cost: (
              parseFloat(qualityItem.quantity_accepted) * parseFloat(originalItem?.unit_cost || '0')
            ).toString(),
            batch_number: originalItem?.batch_number || '',
            serial_number: originalItem?.serial_number || '',
            expiry_date: originalItem?.expiry_date || null,
            condition_notes: qualityItem.inspector_notes,
            rejection_reason: qualityItem.rejection_reason || '',
            // Extended quality inspection fields
            condition_rating: qualityItem.condition_rating,
            visual_inspection: qualityItem.visual_inspection,
            packaging_condition: qualityItem.packaging_condition,
            expiry_check: qualityItem.expiry_check,
            batch_verification: qualityItem.batch_verification,
            temperature_check: qualityItem.temperature_check || '',
          };
        }),
      };

      await completeQualityInspectionMutation.mutateAsync({
        id: parseInt(id!),
        data: inspectionData,
      });

      toast.success('Quality inspection completed successfully!');
      navigate(`/procurement/grn/${id}`);
    } catch (error: any) {
      console.error('Quality inspection error:', error);
      toast.error(
        error?.response?.data?.message || error?.message || 'Failed to complete quality inspection'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      case 'partial':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'excellent':
        return '#10b981';
      case 'good':
        return '#22c55e';
      case 'fair':
        return '#f59e0b';
      case 'poor':
        return '#ef4444';
      case 'damaged':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  if (loadingGRN) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading GRN for quality inspection...</div>
      </div>
    );
  }

  if (!grn) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>GRN not found</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate(`/procurement/grn/${id}`)}
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
              Quality Inspection - {grn.grn_number}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Perform quality checks and update inspection results for received goods
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* GRN Summary */}
        <div
          style={{
            marginBottom: '32px',
            background: '#f0f9ff',
            border: '2px solid #0ea5e9',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#0c4a6e' }}>
            GRN Summary
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <strong>Supplier:</strong> {grn.supplier_name}
            </div>
            <div>
              <strong>Received Date:</strong> {new Date(grn.received_date).toLocaleDateString()}
            </div>
            <div>
              <strong>Location:</strong> {grn.location_name}
            </div>
            <div>
              <strong>Current Status:</strong>
              <span
                style={{
                  marginLeft: '8px',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  background: `${getStatusColor(grn.quality_status)}20`,
                  color: getStatusColor(grn.quality_status),
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {grn.quality_status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Items Quality Inspection */}
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
            <Eye size={20} />
            Items Quality Inspection ({formData.items.length})
          </h2>

          <div style={{ display: 'grid', gap: '24px' }}>
            {formData.items.map((item, index) => (
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
                    {item.item_name}
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
                      <strong>Received:</strong> {item.quantity_received}
                    </span>
                    <span>
                      <strong>Accepted:</strong> {item.quantity_accepted}
                    </span>
                    <span>
                      <strong>Rejected:</strong> {item.quantity_rejected}
                    </span>
                  </div>
                </div>

                {/* Quality Check Fields */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
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
                      <Star size={16} style={{ display: 'inline', marginRight: '6px' }} />
                      Overall Condition *
                    </label>
                    <select
                      value={item.condition_rating}
                      onChange={e => handleItemChange(index, 'condition_rating', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: 'white',
                      }}
                    >
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                      <option value="damaged">Damaged</option>
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
                      <Package size={16} style={{ display: 'inline', marginRight: '6px' }} />
                      Packaging Condition
                    </label>
                    <select
                      value={item.packaging_condition}
                      onChange={e => handleItemChange(index, 'packaging_condition', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: 'white',
                      }}
                    >
                      <option value="intact">Intact</option>
                      <option value="damaged">Damaged</option>
                      <option value="opened">Opened</option>
                      <option value="missing">Missing</option>
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
                      <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
                      Expiry Check
                    </label>
                    <select
                      value={item.expiry_check}
                      onChange={e => handleItemChange(index, 'expiry_check', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: 'white',
                      }}
                    >
                      <option value="valid">Valid</option>
                      <option value="near_expiry">Near Expiry</option>
                      <option value="expired">Expired</option>
                      <option value="not_applicable">Not Applicable</option>
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
                      <Thermometer size={16} style={{ display: 'inline', marginRight: '6px' }} />
                      Temperature (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={item.temperature_check || ''}
                      onChange={e => handleItemChange(index, 'temperature_check', e.target.value)}
                      placeholder="Optional"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                {/* Visual Inspection */}
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
                    Visual Inspection Notes
                  </label>
                  <textarea
                    value={item.visual_inspection}
                    onChange={e => handleItemChange(index, 'visual_inspection', e.target.value)}
                    placeholder="Describe visual inspection findings..."
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

                {/* Inspector Notes */}
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
                    Inspector Notes
                  </label>
                  <textarea
                    value={item.inspector_notes}
                    onChange={e => handleItemChange(index, 'inspector_notes', e.target.value)}
                    placeholder="Additional notes from inspector..."
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

                {/* Rejection Reason (if applicable) */}
                {parseFloat(item.quantity_rejected) > 0 && (
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
                      <XCircle
                        size={16}
                        style={{ display: 'inline', marginRight: '6px', color: '#ef4444' }}
                      />
                      Rejection Reason *
                    </label>
                    <textarea
                      value={item.rejection_reason || ''}
                      onChange={e => handleItemChange(index, 'rejection_reason', e.target.value)}
                      placeholder="Explain why items were rejected..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #ef4444',
                        borderRadius: '6px',
                        fontSize: '14px',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}

                {/* Condition Status Indicator */}
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: `${getConditionColor(item.condition_rating)}10`,
                    border: `1px solid ${getConditionColor(item.condition_rating)}30`,
                  }}
                >
                  <div
                    style={{
                      color: getConditionColor(item.condition_rating),
                      fontWeight: 600,
                      fontSize: '14px',
                    }}
                  >
                    Condition: {item.condition_rating.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Inspection Summary */}
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
            Overall Inspection Summary
          </h2>

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
              Overall Quality Status
            </label>
            <div
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                background: '#f9fafb',
                fontSize: '16px',
                fontWeight: 600,
                color: getStatusColor(calculateOverallStatus()),
              }}
            >
              {calculateOverallStatus().toUpperCase()} (Auto-calculated)
            </div>
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
              Overall Inspection Notes
            </label>
            <textarea
              value={formData.inspection_notes}
              onChange={e => handleFieldChange('inspection_notes', e.target.value)}
              placeholder="Enter overall inspection summary and recommendations..."
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

          {/* Photo Upload Placeholder */}
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
              Inspection Photos
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
                Photo Upload - Coming Soon
              </p>
              <p style={{ margin: 0, fontSize: '12px' }}>
                Upload inspection photos and quality check documentation
              </p>
            </div>
          </div>
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
            onClick={() => navigate(`/procurement/grn/${id}`)}
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
              background: isSubmitting ? '#9ca3af' : '#10b981',
              color: 'white',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle size={16} />
            {isSubmitting ? 'Saving Inspection...' : 'Complete Quality Inspection'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GRNQualityCheckPage;
