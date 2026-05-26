import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Send,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  AlertCircle,
  MoreHorizontal,
  RefreshCw,
  Grid,
  List,
  Trash2,
} from 'lucide-react';

import {
  usePurchaseOrders,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useSendPurchaseOrder,
  useAcknowledgePurchaseOrder,
  useCancelPurchaseOrder,
  useDeletePurchaseOrder,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useOptimisticUpdates } from '../../hooks/useOptimisticUpdates';
import {
  useResponsive,
  useResponsiveGrid,
  useResponsiveSpacing,
  useResponsiveTypography,
} from '../../hooks/useResponsive';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { PurchaseOrder } from '../../services/procurementService';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import ErrorFallback from '../../components/error/ErrorFallback';
import LoadingState from '../../components/ui/LoadingState';
import ConflictResolutionModal from '../../components/ui/ConflictResolutionModal';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { CardSkeleton, ListSkeleton } from '../../components/ui/SkeletonLoader';
import PaginationControls from '../../components/ui/PaginationControls';
import VirtualizedList from '../../components/ui/VirtualizedList';

const PurchaseOrderListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { handleError } = useErrorHandler();
  const { canUserApprove } = useApprovalGuard();
  const { isMobile, isTablet } = useResponsive();
  const { gridTemplateColumns, gap } = useResponsiveGrid({
    xs: 1,
    sm: 1,
    md: 1,
    lg: 2,
    xl: 2,
    '2xl': 3,
  });
  const spacing = useResponsiveSpacing();
  const typography = useResponsiveTypography();

  // Performance monitoring
  const { startMeasure, endMeasure, logMetrics } = usePerformanceMonitor({
    componentName: 'PurchaseOrderListPage',
    enabled: process.env.NODE_ENV === 'development',
  });

  // Utility functions - moved to top to avoid hoisting issues
  const getStatusColor = useCallback((status: string) => {
    const colors = {
      draft: '#6b7280',
      submitted: '#3b82f6',
      approved: '#10b981',
      sent: '#8b5cf6',
      acknowledged: '#059669',
      partially_received: '#f59e0b',
      received: '#059669',
      cancelled: '#ef4444',
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    const icons = {
      approved: CheckCircle,
      sent: Truck,
      acknowledged: CheckCircle,
      partially_received: Package,
      received: CheckCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    return <Icon size={16} />;
  }, []);

  const getStatusLabel = useCallback((status: string) => {
    const labels = {
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      sent: 'Sent',
      acknowledged: 'Acknowledged',
      partially_received: 'Partially Received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return labels[status as keyof typeof labels] || status;
  }, []);

  // Permission check functions - Updated to match detail page workflow
  const canSubmit = useCallback((po: PurchaseOrder) => po.status === 'draft', []);
  const canApprove = useCallback((po: PurchaseOrder) => po.status === 'submitted', []);
  const canSend = useCallback((po: PurchaseOrder) => po.status === 'approved', []);
  const canAcknowledge = useCallback((po: PurchaseOrder) => po.status === 'sent', []);
  const canCancel = useCallback(
    (po: PurchaseOrder) => ['draft', 'submitted', 'approved'].includes(po.status),
    []
  );
  const canCreateGRN = useCallback(
    (po: PurchaseOrder) => ['sent', 'acknowledged', 'partially_received'].includes(po.status),
    []
  );
  const canEdit = useCallback((po: PurchaseOrder) => po.status === 'draft', []);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('-created_at');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);
  const [enableVirtualization, setEnableVirtualization] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [poToDelete, setPOToDelete] = useState<PurchaseOrder | null>(null);

  // Debounced search to prevent excessive API calls
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Memoized query parameters to prevent unnecessary re-renders
  const queryParams = useMemo(
    () => ({
      search: debouncedSearchQuery || undefined,
      status: filterStatus === 'all' ? undefined : filterStatus,
      ordering: sortBy,
      page: currentPage,
    }),
    [debouncedSearchQuery, filterStatus, sortBy, currentPage]
  );

  // React Query hooks with optimized caching
  const {
    data: purchaseOrdersData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = usePurchaseOrders(queryParams);

  // Mutations
  const submitPOMutation = useSubmitPurchaseOrder();
  const approvePOMutation = useApprovePurchaseOrder();
  const sendPOMutation = useSendPurchaseOrder();
  const acknowledgePOMutation = useAcknowledgePurchaseOrder();
  const cancelPOMutation = useCancelPurchaseOrder();
  const deletePOMutation = useDeletePurchaseOrder();

  // Optimistic updates
  const { optimisticUpdate } = useOptimisticUpdates<PurchaseOrder>({
    onConflict: async conflict => {
      setConflictData(conflict);
      setShowConflictModal(true);
      return new Promise(resolve => {
        window.resolveConflict = resolve;
      });
    },
  });

  const purchaseOrders = purchaseOrdersData?.results || [];
  const processing =
    submitPOMutation.isPending ||
    approvePOMutation.isPending ||
    sendPOMutation.isPending ||
    acknowledgePOMutation.isPending ||
    cancelPOMutation.isPending ||
    deletePOMutation.isPending;

  // Memoized functions to prevent unnecessary re-renders
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    setCurrentPage(1); // Reset to first page on sort change
  }, []);

  // Auto-enable virtualization for large datasets
  useEffect(() => {
    setEnableVirtualization(purchaseOrders.length > 20);
  }, [purchaseOrders.length]);

  // Calculate pagination data
  const totalItems = purchaseOrdersData?.count || 0;
  const itemsPerPage = 20; // Assuming 20 items per page
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Handler functions - moved before renderPurchaseOrderCard to avoid circular dependency
  const handleSubmitPO = useCallback(
    async (poId: number) => {
      if (!confirm('Submit this purchase order for approval?')) return;

      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      try {
        const queryKey = ['purchase-orders'];
        const updatedPO = { ...po, status: 'submitted' as const };

        await optimisticUpdate(queryKey, () => submitPOMutation.mutateAsync(poId), updatedPO, po);
        toast.success('Purchase Order submitted for approval!');
      } catch (err: unknown) {
        handleError(err, 'submit purchase order', {
          onRetry: () => handleSubmitPO(poId),
        });
      }
    },
    [purchaseOrders, submitPOMutation, optimisticUpdate, toast, handleError]
  );

  const handleApprovePO = useCallback(
    async (poId: number) => {
      if (!confirm('Approve this purchase order?')) return;

      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      try {
        const queryKey = ['purchase-orders'];
        const updatedPO = { ...po, status: 'approved' as const };

        await optimisticUpdate(queryKey, () => approvePOMutation.mutateAsync(poId), updatedPO, po);
        toast.success('Purchase Order approved successfully!');
      } catch (err: unknown) {
        handleError(err, 'approve purchase order', {
          onRetry: () => handleApprovePO(poId),
        });
      }
    },
    [purchaseOrders, approvePOMutation, optimisticUpdate, toast, handleError]
  );

  const handleSendPO = useCallback(
    async (poId: number) => {
      if (!confirm('Send this purchase order to supplier?')) return;

      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      try {
        const queryKey = ['purchase-orders'];
        const updatedPO = { ...po, status: 'sent' as const };

        await optimisticUpdate(queryKey, () => sendPOMutation.mutateAsync(poId), updatedPO, po);
        toast.success('Purchase Order sent to supplier!');
      } catch (err: unknown) {
        handleError(err, 'send purchase order', {
          onRetry: () => handleSendPO(poId),
        });
      }
    },
    [purchaseOrders, sendPOMutation, optimisticUpdate, toast, handleError]
  );

  const handleAcknowledgePO = useCallback(
    async (poId: number) => {
      if (!confirm('Acknowledge receipt of this purchase order?')) return;

      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      try {
        const queryKey = ['purchase-orders'];
        const updatedPO = { ...po, status: 'acknowledged' as const };

        await optimisticUpdate(
          queryKey,
          () =>
            acknowledgePOMutation.mutateAsync({
              id: poId,
              data: {
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString(),
              },
            }),
          updatedPO,
          po
        );
        toast.success('Purchase Order acknowledged successfully!');
      } catch (err: unknown) {
        handleError(err, 'acknowledge purchase order', {
          onRetry: () => handleAcknowledgePO(poId),
        });
      }
    },
    [purchaseOrders, acknowledgePOMutation, optimisticUpdate, toast, handleError]
  );

  const handleCancelPO = useCallback(
    async (poId: number) => {
      const reason = prompt('Enter cancellation reason:');
      if (!reason) return;

      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      try {
        const queryKey = ['purchase-orders'];
        const updatedPO = { ...po, status: 'cancelled' as const };

        await optimisticUpdate(
          queryKey,
          () => cancelPOMutation.mutateAsync({ id: poId, reason }),
          updatedPO,
          po
        );
        toast.success('Purchase Order cancelled');
      } catch (err: unknown) {
        handleError(err, 'cancel purchase order', {
          onRetry: () => handleCancelPO(poId),
        });
      }
    },
    [purchaseOrders, cancelPOMutation, optimisticUpdate, toast, handleError]
  );

  const handleDeletePO = useCallback(
    async (poId: number) => {
      const po = purchaseOrders.find(p => p.id === poId);
      if (!po) return;

      setPOToDelete(po);
      setShowDeleteModal(true);
    },
    [purchaseOrders]
  );

  const confirmDeletePO = useCallback(async () => {
    if (!poToDelete) return;

    try {
      await deletePOMutation.mutateAsync(poToDelete.id);
      toast.success('Purchase Order deleted successfully');
      setShowDeleteModal(false);
      setPOToDelete(null);
    } catch (err: unknown) {
      handleError(err, 'delete purchase order', {
        onRetry: () => confirmDeletePO(),
      });
    }
  }, [poToDelete, deletePOMutation, toast, handleError]);

  // Memoized render function for virtualization
  const renderPurchaseOrderCard = useCallback(
    (po: PurchaseOrder, index: number) => (
      <div
        key={po.id}
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: spacing.lg,
          margin: spacing.sm,
          transition: 'all 0.2s ease',
          height: 'fit-content',
          minHeight: '180px',
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
            marginBottom: spacing.md,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: spacing.xs,
              }}
            >
              <h3 style={{ margin: 0, ...typography.h3, color: '#1f2937' }}>{po.po_number}</h3>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: `${getStatusColor(po.status)}20`,
                  color: getStatusColor(po.status),
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {getStatusIcon(po.status)}
                {getStatusLabel(po.status)}
              </div>
            </div>
            <p style={{ margin: `0 0 ${spacing.xs} 0`, color: '#6b7280', ...typography.body }}>
              <strong>Supplier:</strong> {po.supplier_name}
            </p>
            <p style={{ margin: `0 0 ${spacing.xs} 0`, color: '#6b7280', ...typography.body }}>
              <strong>Delivery:</strong> {po.location_name}
            </p>
            {po.expected_delivery_date && (
              <p style={{ margin: `0 0 ${spacing.xs} 0`, color: '#6b7280', ...typography.body }}>
                <strong>Expected:</strong>{' '}
                {new Date(po.expected_delivery_date).toLocaleDateString()}
              </p>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: isMobile ? '20px' : '24px',
                fontWeight: 'bold',
                color: '#1f2937',
                marginBottom: spacing.xs,
              }}
            >
              ₦{parseFloat(po.total_amount).toLocaleString()}
            </div>
            <div style={{ ...typography.caption, color: '#6b7280' }}>
              {po.items?.length || 0} item{(po.items?.length || 0) !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Progress Bar for Received Items */}
        {po.status === 'partially_received' && po.items && po.items.length > 0 && (
          <div style={{ marginBottom: spacing.md }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.xs,
              }}
            >
              <span style={{ ...typography.caption, color: '#6b7280' }}>Delivery Progress</span>
              <span style={{ ...typography.caption, color: '#6b7280' }}>
                {(() => {
                  const totalReceived = po.items.reduce(
                    (sum, item) => sum + parseFloat(item.quantity_received || '0'),
                    0
                  );
                  const totalOrdered = po.items.reduce(
                    (sum, item) => sum + parseFloat(item.quantity || '0'),
                    0
                  );
                  return totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
                })()}
                %
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#10b981',
                  width: `${(() => {
                    const totalReceived = po.items.reduce(
                      (sum, item) => sum + parseFloat(item.quantity_received || '0'),
                      0
                    );
                    const totalOrdered = po.items.reduce(
                      (sum, item) => sum + parseFloat(item.quantity || '0'),
                      0
                    );
                    return totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
                  })()}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          style={{ display: 'flex', gap: spacing.xs, justifyContent: 'flex-end', flexWrap: 'wrap' }}
        >
          <button
            onClick={() => navigate(`/procurement/orders/${po.id}/view`)}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
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
            {!isMobile && 'View'}
          </button>

          {po.status === 'draft' && (
            <button
              onClick={() => navigate(`/procurement/orders/${po.id}/edit`)}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
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
              {!isMobile && 'Edit'}
            </button>
          )}

          {canSubmit(po) && (
            <button
              onClick={() => handleSubmitPO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: 'none',
                borderRadius: '6px',
                background: processing ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Send size={14} />
              {!isMobile && 'Submit'}
            </button>
          )}

          {canUserApprove && canApprove(po) && (
            <button
              onClick={() => handleApprovePO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
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
              <CheckCircle size={14} />
              {!isMobile && 'Approve'}
            </button>
          )}

          {canSend(po) && (
            <button
              onClick={() => handleSendPO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: 'none',
                borderRadius: '6px',
                background: processing ? '#9ca3af' : '#8b5cf6',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Send size={14} />
              {!isMobile && 'Send'}
            </button>
          )}

          {canAcknowledge(po) && (
            <button
              onClick={() => handleAcknowledgePO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: 'none',
                borderRadius: '6px',
                background: processing ? '#9ca3af' : '#059669',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle size={14} />
              {!isMobile && 'Acknowledge'}
            </button>
          )}

          {canCreateGRN(po) && (
            <button
              onClick={() => navigate(`/procurement/grn/create?po=${po.id}`)}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: 'none',
                borderRadius: '6px',
                background: '#f59e0b',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Package size={14} />
              {!isMobile && 'Receive'}
            </button>
          )}

          {canCancel(po) && (
            <button
              onClick={() => handleCancelPO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: '1px solid #ef4444',
                borderRadius: '6px',
                background: 'white',
                color: '#ef4444',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <XCircle size={14} />
              {!isMobile && 'Cancel'}
            </button>
          )}

          {/* Delete button - only show for draft orders */}
          {po.status === 'draft' && (
            <button
              onClick={() => handleDeletePO(po.id)}
              disabled={processing}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: '1px solid #dc2626',
                borderRadius: '6px',
                background: 'white',
                color: '#dc2626',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Trash2 size={14} />
              {!isMobile && 'Delete'}
            </button>
          )}
        </div>
      </div>
    ),
    [
      spacing,
      typography,
      isMobile,
      getStatusColor,
      getStatusIcon,
      getStatusLabel,
      navigate,
      processing,
      canApprove,
      canSend,
      canCreateGRN,
      canCancel,
      handleApprovePO,
      handleSendPO,
      handleCancelPO,
      handleDeletePO,
    ]
  );

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

  if (error) {
    return (
      <ErrorFallback
        title="Error Loading Purchase Orders"
        message="Failed to load purchase orders. Please try again."
        showRetry={true}
        resetError={() => refetch()}
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Loading purchase orders..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorFallback
          title="Purchase Orders Error"
          message="An error occurred while displaying purchase orders."
          showRetry={true}
          showGoBack={true}
          onGoBack={() => navigate('/procurement')}
        />
      }
    >
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
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

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setPOToDelete(null);
          }}
          onConfirm={confirmDeletePO}
          title="Delete Purchase Order"
          message={`Are you sure you want to delete purchase order ${poToDelete?.po_number}? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          isLoading={deletePOMutation.isPending}
        />
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
                Purchase Orders
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
                Manage purchase orders and track supplier deliveries
              </p>
            </div>
            <button
              onClick={() => navigate('/procurement/orders/create')}
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
              Create Purchase Order
            </button>
          </div>

          {/* Search and Filters */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
            }}
          >
            <div
              style={{
                position: 'relative',
                flex: isMobile ? 'none' : '1',
                width: isMobile ? '100%' : 'auto',
                minWidth: isMobile ? 'auto' : '300px',
              }}
            >
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
                placeholder="Search by PO number or supplier..."
                value={searchQuery}
                onChange={handleSearchChange}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <Filter size={16} style={{ color: '#6b7280' }} />
              <select
                value={filterStatus}
                onChange={handleStatusChange}
                style={{
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minWidth: isMobile ? 'auto' : '150px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="sent">Sent</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="partially_received">Partially Received</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <select
              value={sortBy}
              onChange={handleSortChange}
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: isMobile ? 'auto' : '150px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <option value="-created_at">Newest First</option>
              <option value="created_at">Oldest First</option>
              <option value="po_number">PO Number</option>
              <option value="supplier__name">Supplier Name</option>
              <option value="-total_amount">Highest Amount</option>
              <option value="total_amount">Lowest Amount</option>
            </select>
          </div>
        </div>

        {/* Purchase Orders Grid */}
        {isLoading || isFetching ? (
          <div style={{ display: 'grid', gap: '16px' }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : purchaseOrders.length === 0 ? (
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
              No Purchase Orders Found
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
              {searchQuery || filterStatus !== 'all'
                ? 'No purchase orders match your current filters.'
                : 'Get started by creating your first purchase order.'}
            </p>
            <button
              onClick={() => navigate('/procurement/orders/create')}
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
              Create Purchase Order
            </button>
          </div>
        ) : enableVirtualization && purchaseOrders.length > 10 ? (
          <VirtualizedList
            items={purchaseOrders}
            itemHeight={200}
            containerHeight={600}
            renderItem={renderPurchaseOrderCard}
            getItemKey={po => po.id}
            className="virtualized-po-list"
          />
        ) : (
          <div
            style={{
              display: viewMode === 'grid' ? 'grid' : 'flex',
              gridTemplateColumns: viewMode === 'grid' ? gridTemplateColumns : undefined,
              flexDirection: viewMode === 'list' ? 'column' : undefined,
              gap: gap,
            }}
          >
            {purchaseOrders.map(po => renderPurchaseOrderCard(po, 0))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            loading={isFetching}
            showInfo={true}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default PurchaseOrderListPage;
