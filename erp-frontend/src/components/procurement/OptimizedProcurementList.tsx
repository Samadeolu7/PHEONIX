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
  RefreshCw,
  Grid,
  List,
  Download,
  Upload,
} from 'lucide-react';

import {
  usePurchaseOrders,
  useApprovePurchaseOrder,
  useSendPurchaseOrder,
  useCancelPurchaseOrder,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useOptimisticUpdates } from '../../hooks/useOptimisticUpdates';
import { useResponsive, useResponsiveGrid } from '../../hooks/useResponsive';
import { useDataCache } from '../../hooks/useDataCache';
import { PurchaseOrder } from '../../services/procurementService';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import ErrorFallback from '../../components/error/ErrorFallback';
import ConflictResolutionModal from '../../components/ui/ConflictResolutionModal';
import { CardSkeleton, ListSkeleton } from '../../components/ui/SkeletonLoader';
import PaginationControls from '../../components/ui/PaginationControls';
import VirtualizedList from '../../components/ui/VirtualizedList';

interface OptimizedProcurementListProps {
  itemHeight?: number;
  enableVirtualization?: boolean;
  enableInfiniteScroll?: boolean;
  cacheOptions?: {
    ttl?: number;
    enablePersistence?: boolean;
  };
}

const OptimizedProcurementList: React.FC<OptimizedProcurementListProps> = ({
  itemHeight = 200,
  enableVirtualization = true,
  enableInfiniteScroll = false,
  cacheOptions = { ttl: 5 * 60 * 1000, enablePersistence: true },
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { handleError } = useErrorHandler();
  const { isMobile, isTablet } = useResponsive();
  const { gridTemplateColumns } = useResponsiveGrid({
    xs: 1,
    sm: 1,
    md: 1,
    lg: 2,
    xl: 2,
    '2xl': 3,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('-created_at');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Debounced search to prevent excessive API calls
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page on search
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
      page_size: enableInfiniteScroll ? 50 : 20,
    }),
    [debouncedSearchQuery, filterStatus, sortBy, currentPage, enableInfiniteScroll]
  );

  // Enhanced caching with persistence
  const cacheKey = useMemo(() => `purchase-orders-${JSON.stringify(queryParams)}`, [queryParams]);

  const {
    data: cachedData,
    isLoading: cacheLoading,
    isStale,
    refetch: refetchCache,
  } = useDataCache(
    cacheKey,
    {
      fetcher: async () => {
        const response = await fetch(
          `/api/procurement/purchase-orders/?${new URLSearchParams(queryParams)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      ...cacheOptions,
    },
    'procurement-cache'
  );

  // React Query hooks with optimized caching
  const {
    data: purchaseOrdersData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = usePurchaseOrders(queryParams);

  // Use cached data if available and not stale, otherwise use React Query data
  const effectiveData = (!isStale && cachedData) || purchaseOrdersData;
  const effectiveLoading = cacheLoading || isLoading;

  // Mutations
  const approvePOMutation = useApprovePurchaseOrder();
  const sendPOMutation = useSendPurchaseOrder();
  const cancelPOMutation = useCancelPurchaseOrder();

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

  const purchaseOrders = effectiveData?.results || [];
  const processing =
    approvePOMutation.isPending || sendPOMutation.isPending || cancelPOMutation.isPending;

  // Memoized functions to prevent unnecessary re-renders
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleViewModeChange = useCallback((mode: 'grid' | 'list' | 'table') => {
    setViewMode(mode);
  }, []);

  // Infinite scroll handler
  const handleLoadMore = useCallback(async () => {
    if (!enableInfiniteScroll || isLoadingMore || !effectiveData?.next) return;

    setIsLoadingMore(true);
    try {
      // Load next page and append to current data
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
    } catch (error) {
      handleError(error, 'load more purchase orders');
    } finally {
      setIsLoadingMore(false);
    }
  }, [enableInfiniteScroll, isLoadingMore, effectiveData?.next, currentPage, handleError]);

  // Calculate pagination data
  const totalItems = effectiveData?.count || 0;
  const itemsPerPage = queryParams.page_size || 20;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

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
        refetchCache(); // Update cache
      } catch (err: unknown) {
        handleError(err, 'approve purchase order', {
          onRetry: () => handleApprovePO(poId),
        });
      }
    },
    [purchaseOrders, optimisticUpdate, approvePOMutation, toast, handleError, refetchCache]
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
        refetchCache(); // Update cache
      } catch (err: unknown) {
        handleError(err, 'send purchase order', {
          onRetry: () => handleSendPO(poId),
        });
      }
    },
    [purchaseOrders, optimisticUpdate, sendPOMutation, toast, handleError, refetchCache]
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
        refetchCache(); // Update cache
      } catch (err: unknown) {
        handleError(err, 'cancel purchase order', {
          onRetry: () => handleCancelPO(poId),
        });
      }
    },
    [purchaseOrders, optimisticUpdate, cancelPOMutation, toast, handleError, refetchCache]
  );

  const handleConflictResolve = useCallback(
    (resolution: 'use_local' | 'use_server' | 'merge', mergedData?: any) => {
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
    },
    [conflictData]
  );

  // Memoized utility functions
  const getStatusColor = useCallback((status: string) => {
    const colors = {
      draft: '#6b7280',
      submitted: '#3b82f6',
      approved: '#10b981',
      sent: '#8b5cf6',
      partially_received: '#f59e0b',
      received: '#059669',
      cancelled: '#ef4444',
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    const icons = {
      approved: CheckCircle,
      partially_received: Package,
      received: CheckCircle,
      cancelled: XCircle,
      sent: Truck,
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
      partially_received: 'Partially Received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return labels[status as keyof typeof labels] || status;
  }, []);

  // Memoized permission checks
  const canApprove = useCallback((po: PurchaseOrder) => po.status === 'submitted', []);
  const canSend = useCallback((po: PurchaseOrder) => po.status === 'approved', []);
  const canCancel = useCallback(
    (po: PurchaseOrder) => ['draft', 'submitted', 'approved'].includes(po.status),
    []
  );
  const canCreateGRN = useCallback(
    (po: PurchaseOrder) => ['sent', 'partially_received'].includes(po.status),
    []
  );

  // Memoized render functions for virtualization
  const renderPurchaseOrderCard = useCallback(
    (po: PurchaseOrder, index: number) => (
      <div
        key={po.id}
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: isMobile ? '16px' : '24px',
          margin: '8px',
          transition: 'all 0.2s ease',
          height: 'fit-content',
          minHeight: itemHeight - 16,
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
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: isMobile ? '16px' : '18px',
                  fontWeight: 600,
                  color: '#1f2937',
                }}
              >
                {po.po_number}
              </h3>
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
            <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
              <strong>Supplier:</strong> {po.supplier_name}
            </p>
            <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
              <strong>Delivery:</strong> {po.location_name}
            </p>
            {po.expected_delivery_date && (
              <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
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
                marginBottom: '4px',
              }}
            >
              ₦{parseFloat(po.total_amount).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {po.items.length} item{po.items.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Progress Bar for Received Items */}
        {po.status === 'partially_received' && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Delivery Progress</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {Math.round(
                  (po.items.reduce((sum, item) => sum + item.quantity_received, 0) /
                    po.items.reduce((sum, item) => sum + item.quantity, 0)) *
                    100
                )}
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
                  width: `${
                    (po.items.reduce((sum, item) => sum + item.quantity_received, 0) /
                      po.items.reduce((sum, item) => sum + item.quantity, 0)) *
                    100
                  }%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(`/procurement/orders/${po.id}/view`)}
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

          {po.status === 'draft' && (
            <button
              onClick={() => navigate(`/procurement/orders/${po.id}/edit`)}
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
              Edit
            </button>
          )}

          {canApprove(po) && (
            <button
              onClick={() => handleApprovePO(po.id)}
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
              <CheckCircle size={14} />
              Approve
            </button>
          )}

          {canSend(po) && (
            <button
              onClick={() => handleSendPO(po.id)}
              disabled={processing}
              style={{
                padding: '8px 16px',
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
              Send
            </button>
          )}

          {canCreateGRN(po) && (
            <button
              onClick={() => navigate(`/procurement/grn/create?po=${po.id}`)}
              style={{
                padding: '8px 16px',
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
              Receive
            </button>
          )}

          {canCancel(po) && (
            <button
              onClick={() => handleCancelPO(po.id)}
              disabled={processing}
              style={{
                padding: '8px 16px',
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
              Cancel
            </button>
          )}
        </div>
      </div>
    ),
    [
      isMobile,
      itemHeight,
      getStatusColor,
      getStatusIcon,
      getStatusLabel,
      navigate,
      handleApprovePO,
      handleSendPO,
      handleCancelPO,
      processing,
      canApprove,
      canSend,
      canCreateGRN,
      canCancel,
    ]
  );

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
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1400px', margin: '0 auto' }}>
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: isMobile ? '24px' : '32px',
                  fontWeight: 'bold',
                  color: '#1f2937',
                }}
              >
                Purchase Orders
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
                Manage purchase orders and track supplier deliveries
              </p>
              {isStale && (
                <p style={{ margin: '4px 0 0 0', color: '#f59e0b', fontSize: '14px' }}>
                  ⚠️ Showing cached data - refreshing...
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* View Mode Toggle */}
              <div
                style={{
                  display: 'flex',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => handleViewModeChange('grid')}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    background: viewMode === 'grid' ? '#3b82f6' : 'white',
                    color: viewMode === 'grid' ? 'white' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => handleViewModeChange('list')}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    background: viewMode === 'list' ? '#3b82f6' : 'white',
                    color: viewMode === 'list' ? 'white' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  <List size={16} />
                </button>
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
                {!isMobile && 'Create Purchase Order'}
              </button>
            </div>
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

            <button
              onClick={() => {
                refetch();
                refetchCache();
              }}
              disabled={isFetching}
              style={{
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                cursor: isFetching ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw
                size={16}
                style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }}
              />
              {!isMobile && 'Refresh'}
            </button>
          </div>
        </div>

        {/* Purchase Orders Content */}
        {effectiveLoading ? (
          <ListSkeleton items={5} compact={isMobile} />
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
            itemHeight={itemHeight}
            containerHeight={600}
            renderItem={renderPurchaseOrderCard}
            onEndReached={enableInfiniteScroll ? handleLoadMore : undefined}
            loading={isLoadingMore}
            loadingComponent={<CardSkeleton compact={isMobile} />}
            getItemKey={po => po.id}
            className="virtualized-po-list"
          />
        ) : (
          <div
            style={{
              display: viewMode === 'grid' ? 'grid' : 'flex',
              gridTemplateColumns: viewMode === 'grid' ? gridTemplateColumns : undefined,
              flexDirection: viewMode === 'list' ? 'column' : undefined,
              gap: '16px',
            }}
          >
            {purchaseOrders.map(po => renderPurchaseOrderCard(po, 0))}
          </div>
        )}

        {/* Pagination */}
        {!enableInfiniteScroll && totalPages > 1 && (
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

export default OptimizedProcurementList;
