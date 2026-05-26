import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Package,
  Truck,
  Calendar,
  User,
  Building,
  DollarSign,
  Archive,
  Calculator,
  Trash2,
} from 'lucide-react';

import {
  useGRNs,
  usePostGRNToInventoryAndAccounting,
  useAllProcurementSuppliers,
  useDeleteGRN,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { GoodsReceivedNote } from '../../services/procurementService';

const GRNListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterQualityStatus, setFilterQualityStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('-created_at');
  const [showPostedFilter, setShowPostedFilter] = useState('all');

  // React Query hooks - Updated to send all filters to backend
  const {
    data: grnsData,
    isLoading,
    error,
  } = useGRNs({
    search: searchQuery || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
    quality_status: filterQualityStatus === 'all' ? undefined : filterQualityStatus,
    supplier_id: filterSupplier === 'all' ? undefined : parseInt(filterSupplier),
    is_posted: showPostedFilter === 'all' ? undefined : showPostedFilter === 'posted',
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ordering: sortBy,
  });

  const { data: suppliersData } = useAllProcurementSuppliers();

  // Mutations
  const postGRNMutation = usePostGRNToInventoryAndAccounting();
  const deleteGRNMutation = useDeleteGRN();

  const grns = grnsData?.results || [];
  const suppliers = suppliersData || [];
  const processing = postGRNMutation.isPending || deleteGRNMutation.isPending;

  // No client-side filtering needed since filters are sent to backend
  const filteredGRNs = grns;

  const handlePostGRN = async (grnId: number) => {
    if (
      !confirm(
        'Post this GRN? This will update inventory levels and create accounts payable entries.'
      )
    )
      return;

    try {
      // Don't pass any data - let the service method fetch the current GRN data
      await postGRNMutation.mutateAsync({ id: grnId });
      toast.success('GRN posted successfully! Inventory updated and AP entry created.');
    } catch (err: unknown) {
      console.error('Failed to post GRN:', err);
      toast.error('Failed to post GRN');
    }
  };

  const handleDeleteGRN = async (grnId: number, grnNumber: string) => {
    if (!confirm(`Delete GRN ${grnNumber}? This action cannot be undone.`)) return;

    try {
      await deleteGRNMutation.mutateAsync(grnId);
      toast.success('GRN deleted successfully!');
    } catch (err: unknown) {
      console.error('Failed to delete GRN:', err);
      toast.error('Failed to delete GRN');
    }
  };

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

  const canEdit = (grn: GoodsReceivedNote) => !grn.is_posted;
  const canPost = (grn: GoodsReceivedNote) => !grn.is_posted && grn.quality_status !== 'pending';

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading Goods Received Notes</h3>
          <p>Failed to load GRNs. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#1f2937',
              }}
            >
              Goods Received Notes
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Manage goods receipt, quality inspection, and posting to inventory and accounting
            </p>
          </div>
          <button
            onClick={() => navigate('/procurement/grn/create')}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={20} />
            Create GRN
          </button>
        </div>

        {/* Search and Filters */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div style={{ position: 'relative', flex: '1', minWidth: '300px' }}>
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
              placeholder="Search by GRN number, PO number, or supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: '#6b7280' }} />
            <select
              value={filterQualityStatus}
              onChange={e => setFilterQualityStatus(e.target.value)}
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '150px',
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
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="all">All Suppliers</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id.toString()}>
                {supplier.name}
              </option>
            ))}
          </select>

          <select
            value={showPostedFilter}
            onChange={e => setShowPostedFilter(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '120px',
            }}
          >
            <option value="all">All Status</option>
            <option value="posted">Posted</option>
            <option value="unposted">Unposted</option>
          </select>
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: '#6b7280' }} />
            <label style={{ fontSize: '14px', color: '#374151' }}>From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                padding: '8px 12px',
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
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '2px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="-created_at">Newest First</option>
            <option value="created_at">Oldest First</option>
            <option value="grn_number">GRN Number</option>
            <option value="-received_date">Latest Received</option>
            <option value="received_date">Earliest Received</option>
            <option value="supplier_name">Supplier Name</option>
            <option value="-total_amount">Highest Amount</option>
            <option value="total_amount">Lowest Amount</option>
          </select>
        </div>
      </div>

      {/* GRNs Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ color: '#6b7280' }}>Loading goods received notes...</div>
        </div>
      ) : filteredGRNs.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            background: '#f9fafb',
            borderRadius: '12px',
          }}
        >
          <Package size={64} style={{ margin: '0 auto 24px', color: '#d1d5db' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#374151' }}>
            No Goods Received Notes Found
          </h3>
          <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
            {searchQuery ||
            filterQualityStatus !== 'all' ||
            filterSupplier !== 'all' ||
            showPostedFilter !== 'all'
              ? 'No GRNs match your current filters.'
              : 'Get started by creating your first goods received note.'}
          </p>
          <button
            onClick={() => navigate('/procurement/grn/create')}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={16} />
            Create GRN
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredGRNs.map(grn => (
            <div
              key={grn.id}
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
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
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                      {grn.grn_number}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        background: `${getStatusColor(grn.quality_status)}20`,
                        color: getStatusColor(grn.quality_status),
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {getStatusIcon(grn.quality_status)}
                      {getStatusLabel(grn.quality_status)}
                    </div>
                    {grn.is_posted && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: '#10b98120',
                          color: '#10b981',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle size={12} />
                        Posted
                      </div>
                    )}
                  </div>

                  <div
                    style={{ display: 'flex', gap: '24px', marginBottom: '8px', flexWrap: 'wrap' }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Building size={14} />
                      <strong>Supplier:</strong> {grn.supplier_name}
                    </p>
                    {grn.po_number && (
                      <p
                        style={{
                          margin: 0,
                          color: '#6b7280',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Package size={14} />
                        <strong>PO:</strong> {grn.po_number}
                      </p>
                    )}
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Calendar size={14} />
                      <strong>Received:</strong> {new Date(grn.received_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div
                    style={{ display: 'flex', gap: '24px', marginBottom: '8px', flexWrap: 'wrap' }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
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
                          gap: '6px',
                        }}
                      >
                        <Truck size={14} />
                        <strong>Delivery Note:</strong> {grn.delivery_note_number}
                      </p>
                    )}
                  </div>

                  {grn.vehicle_number && (
                    <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                      <strong>Vehicle:</strong> {grn.vehicle_number}
                      {grn.driver_name && ` (Driver: ${grn.driver_name})`}
                    </p>
                  )}

                  <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                    <strong>Items:</strong> {grn.items.length} item
                    {grn.items.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
                      ₦{parseFloat(grn.total_amount).toLocaleString()}
                    </div>
                    {canEdit(grn) && (
                      <button
                        onClick={() => handleDeleteGRN(grn.id, grn.grn_number)}
                        disabled={processing}
                        style={{
                          padding: '4px',
                          border: '1px solid #dc2626',
                          borderRadius: '4px',
                          background: 'white',
                          color: '#dc2626',
                          cursor: processing ? 'not-allowed' : 'pointer',
                          fontSize: '10px',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          height: '24px',
                        }}
                        title="Delete GRN"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Amount</div>
                </div>
              </div>

              {/* Inspection Notes */}
              {grn.inspection_notes && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151', fontStyle: 'italic' }}>
                    <strong>Inspection Notes:</strong> "{grn.inspection_notes}"
                  </p>
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={() => navigate(`/procurement/grn/${grn.id}/view`)}
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
                  <Eye size={14} />
                  View
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

                {canPost(grn) && (
                  <button
                    onClick={() => handlePostGRN(grn.id)}
                    disabled={processing}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      background: processing ? '#9ca3af' : '#10b981',
                      color: 'white',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Archive size={14} />
                    Post GRN
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GRNListPage;
