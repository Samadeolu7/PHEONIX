import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  Truck,
  User,
  Calendar,
  Clock,
  Building,
  Phone,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Printer,
  Edit,
  Archive,
  Calculator,
  DollarSign,
  RotateCcw,
  MapPin,
  Hash,
  Camera,
  Star,
  Info,
  Scale,
  Settings,
  Database,
  CreditCard,
} from 'lucide-react';

import { useGRN, usePostGRNToInventoryAndAccounting } from '../../hooks/useProcurement';

import { useToast } from '../../hooks/useToast';
import { GoodsReceivedNote } from '../../services/procurementService';
import IntegrationManager from '../../components/procurement/IntegrationManager';
import BudgetTracker from '../../components/procurement/BudgetTracker';

const GRNDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [showPhotos, setShowPhotos] = useState<Record<number, boolean>>({});
  const [showIntegration, setShowIntegration] = useState(false);
  const [showBudgetTracker, setShowBudgetTracker] = useState(false);

  // React Query hooks
  const { data: grn, isLoading, error, refetch } = useGRN(parseInt(id || '0'), !!id);

  // Mutations
  const postGRNMutation = usePostGRNToInventoryAndAccounting();

  const processing = postGRNMutation.isPending;

  // Handle posting actions
  const handlePostGRN = async () => {
    if (
      !grn ||
      !confirm(
        'Post this GRN? This will update inventory levels and create accounts payable entries.'
      )
    )
      return;

    try {
      // Don't pass any data - let the service method fetch the current GRN data
      await postGRNMutation.mutateAsync({ id: grn.id });
      toast.success('GRN posted successfully! Inventory updated and AP entry created.');
    } catch (err: unknown) {
      console.error('Failed to post GRN:', err);
      toast.error('Failed to post GRN');
    }
  };

  const handleCreateReturn = () => {
    if (!grn) return;
    navigate(`/procurement/returns/create?grn_id=${grn.id}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // TODO: Implement PDF export functionality
    toast.info('PDF export functionality will be implemented soon');
  };

  const togglePhotos = (itemIndex: number) => {
    setShowPhotos(prev => ({
      ...prev,
      [itemIndex]: !prev[itemIndex],
    }));
  };

  // Helper functions
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'passed':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      case 'partial':
        return '#f97316';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'partial':
        return 'Partial';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      pending: Clock,
      passed: CheckCircle,
      failed: XCircle,
      partial: AlertCircle,
    };
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    return <Icon size={16} />;
  };

  const getConditionColor = (condition: string): string => {
    switch (condition) {
      case 'excellent':
        return '#10b981';
      case 'good':
        return '#22c55e';
      case 'fair':
        return '#f59e0b';
      case 'poor':
        return '#f97316';
      case 'damaged':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getConditionIcon = (condition: string) => {
    switch (condition) {
      case 'excellent':
        return <Star size={14} style={{ color: '#10b981' }} />;
      case 'good':
        return <CheckCircle size={14} style={{ color: '#22c55e' }} />;
      case 'fair':
        return <AlertCircle size={14} style={{ color: '#f59e0b' }} />;
      case 'poor':
        return <XCircle size={14} style={{ color: '#f97316' }} />;
      case 'damaged':
        return <XCircle size={14} style={{ color: '#ef4444' }} />;
      default:
        return <Info size={14} style={{ color: '#6b7280' }} />;
    }
  };

  const canEdit = (grn: GoodsReceivedNote) => !grn.is_posted;
  const canPost = (grn: GoodsReceivedNote) => !grn.is_posted && grn.quality_status !== 'pending';
  const canCreateReturn = (grn: GoodsReceivedNote) => grn.is_posted;

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading GRN details...</div>
      </div>
    );
  }

  if (error || !grn) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading GRN</h3>
          <p>Failed to load GRN details. Please try again.</p>
        </div>
        <button
          onClick={() => navigate('/procurement/grn')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Back to GRN List
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
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
          <div style={{ flex: 1 }}>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#1f2937',
              }}
            >
              {grn.grn_number}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Goods Received Note Details
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#374151',
              }}
            >
              <Printer size={14} />
              Print
            </button>

            <button
              onClick={handleExport}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#374151',
              }}
            >
              <Download size={14} />
              Export PDF
            </button>

            {canEdit(grn) && (
              <button
                onClick={() => navigate(`/procurement/grn/${grn.id}/quality-check`)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#374151',
                }}
              >
                <Edit size={14} />
                Quality Check
              </button>
            )}

            {canCreateReturn(grn) && (
              <button
                onClick={handleCreateReturn}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#f97316',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RotateCcw size={14} />
                Create Return
              </button>
            )}
          </div>
        </div>

        {/* Status and Summary */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '20px',
              background: `${getStatusColor(grn.quality_status)}20`,
              color: getStatusColor(grn.quality_status),
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {getStatusIcon(grn.quality_status)}
            Quality: {getStatusLabel(grn.quality_status)}
          </div>

          {grn.is_posted && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                borderRadius: '16px',
                background: '#10b98120',
                color: '#10b981',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <CheckCircle size={12} />
              Posted
            </div>
          )}

          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
            ₦{parseFloat(grn.total_amount).toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* GRN Header Information */}
        <div
          style={{
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
            GRN Information
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            <div>
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Basic Information
              </h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Hash size={14} />
                  <strong>GRN Number:</strong> {grn.grn_number}
                </p>
                {grn.po_number && (
                  <p
                    style={{
                      margin: 0,
                      color: '#6b7280',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Package size={14} />
                    <strong>Purchase Order:</strong> {grn.po_number}
                  </p>
                )}
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Building size={14} />
                  <strong>Supplier:</strong> {grn.supplier_name}
                </p>
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <MapPin size={14} />
                  <strong>Location:</strong> {grn.location_name}
                </p>
              </div>
            </div>

            <div>
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Delivery Information
              </h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Calendar size={14} />
                  <strong>Received Date:</strong> {new Date(grn.received_date).toLocaleDateString()}
                </p>
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Clock size={14} />
                  <strong>Received Time:</strong> {grn.received_time}
                </p>
                <p
                  style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <User size={14} />
                  <strong>Received By:</strong> {grn.received_by_name}
                </p>
                {grn.delivery_note_number && (
                  <p
                    style={{
                      margin: 0,
                      color: '#6b7280',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <FileText size={14} />
                    <strong>Delivery Note:</strong> {grn.delivery_note_number}
                  </p>
                )}
              </div>
            </div>

            {(grn.vehicle_number || grn.driver_name) && (
              <div>
                <h3
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Vehicle & Driver
                </h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {grn.vehicle_number && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Truck size={14} />
                      <strong>Vehicle:</strong> {grn.vehicle_number}
                    </p>
                  )}
                  {grn.driver_name && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <User size={14} />
                      <strong>Driver:</strong> {grn.driver_name}
                    </p>
                  )}
                  {grn.driver_phone && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Phone size={14} />
                      <strong>Driver Phone:</strong> {grn.driver_phone}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(grn.supplier_invoice_number || grn.supplier_invoice_date) && (
              <div>
                <h3
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Supplier Invoice
                </h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {grn.supplier_invoice_number && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <FileText size={14} />
                      <strong>Invoice Number:</strong> {grn.supplier_invoice_number}
                    </p>
                  )}
                  {grn.supplier_invoice_date && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Calendar size={14} />
                      <strong>Invoice Date:</strong>{' '}
                      {new Date(grn.supplier_invoice_date).toLocaleDateString()}
                    </p>
                  )}
                  {grn.supplier_invoice_amount && (
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <DollarSign size={14} />
                      <strong>Invoice Amount:</strong> ₦
                      {parseFloat(grn.supplier_invoice_amount).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Received Items */}
        <div
          style={{
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
            Received Items ({grn.items.length})
          </h2>

          <div style={{ display: 'grid', gap: '16px' }}>
            {grn.items.map((item, index) => (
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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#1f2937',
                      }}
                    >
                      Item #{item.item_id}
                    </h3>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Scale size={14} />
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>
                          <strong>Received:</strong> {item.quantity_to_receive}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={14} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>
                          <strong>Accepted:</strong> {item.quantity_accepted}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <XCircle size={14} style={{ color: '#ef4444' }} />
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>
                          <strong>Rejected:</strong> {item.quantity_rejected}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Batch Information */}
                {item.batch_number && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '12px',
                      background: '#f0f9ff',
                      borderRadius: '6px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '14px', color: '#0369a1' }}>
                      <strong>Batch Number:</strong> {item.batch_number}
                    </p>
                  </div>
                )}

                {/* Condition Notes */}
                {item.condition_notes && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '12px',
                      background: '#fef3c7',
                      borderRadius: '6px',
                    }}
                  >
                    <p
                      style={{ margin: 0, fontSize: '14px', color: '#92400e', fontStyle: 'italic' }}
                    >
                      <strong>Condition Notes:</strong> "{item.condition_notes}"
                    </p>
                  </div>
                )}

                {/* Photos */}
                {grn.photos && Array.isArray(grn.photos) && grn.photos.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => togglePhotos(index)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#374151',
                      }}
                    >
                      <Camera size={12} />
                      {showPhotos[index] ? 'Hide' : 'Show'} Photos ({grn.photos.length})
                    </button>

                    {showPhotos[index] && (
                      <div
                        style={{
                          marginTop: '12px',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        {grn.photos.map((photo: string, photoIndex: number) => (
                          <img
                            key={photoIndex}
                            src={photo}
                            alt={`Item photo ${photoIndex + 1}`}
                            style={{
                              width: '100%',
                              height: '120px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Posting Status and Accounting Entries */}
        <div
          style={{
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
            <Calculator size={20} />
            Posting Status & Accounting
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
            }}
          >
            <div>
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Posting Status
              </h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {grn.is_posted ? (
                    <CheckCircle size={16} style={{ color: '#10b981' }} />
                  ) : (
                    <Clock size={16} style={{ color: '#f59e0b' }} />
                  )}
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    <strong>Status:</strong> {grn.is_posted ? 'Posted' : 'Not Posted'}
                  </span>
                </div>
                {grn.posted_at && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                    <strong>Posted At:</strong> {new Date(grn.posted_at).toLocaleString()}
                  </p>
                )}
                {grn.posted_by && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                    <strong>Posted By:</strong> User #{grn.posted_by}
                  </p>
                )}
              </div>
            </div>

            {grn.accounts_payable && (
              <div>
                <h3
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Accounts Payable
                </h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                    <strong>AP Entry:</strong> #{grn.accounts_payable}
                  </p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                    <strong>Amount:</strong> ₦{parseFloat(grn.total_amount).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Posting Actions */}
          {canPost(grn) && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handlePostGRN}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#10b981',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Archive size={16} />
                Post GRN
              </button>
            </div>
          )}
        </div>

        {/* Notes and Additional Information */}
        {(grn.inspection_notes || grn.notes) && (
          <div
            style={{
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
              Notes & Comments
            </h2>

            {grn.inspection_notes && (
              <div style={{ marginBottom: '16px' }}>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Inspection Notes
                </h3>
                <div
                  style={{
                    padding: '12px',
                    background: '#f0f9ff',
                    borderRadius: '6px',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#1e40af', fontStyle: 'italic' }}>
                    "{grn.inspection_notes}"
                  </p>
                </div>
              </div>
            )}

            {grn.notes && (
              <div>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  General Notes
                </h3>
                <div
                  style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>{grn.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Integration Manager */}
        {showIntegration && (
          <div
            style={{
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
              <Database size={20} />
              Integration Management
            </h2>
            <IntegrationManager
              entityType="grn"
              entityId={grn.id}
              onIntegrationComplete={() => {
                refetch();
                setShowIntegration(false);
              }}
            />
          </div>
        )}

        {/* Budget Tracker */}
        {showBudgetTracker && (
          <div
            style={{
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
              <CreditCard size={20} />
              Budget Tracking
            </h2>
            <BudgetTracker
              amount={grn.total_amount}
              transactionDate={grn.received_date}
              showUtilization={true}
              showValidation={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default GRNDetailPage;
