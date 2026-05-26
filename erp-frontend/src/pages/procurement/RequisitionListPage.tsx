import React, { useState, useCallback } from 'react';
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
  FileText,
  ShoppingCart,
  Calendar,
  User,
  Building,
  Workflow,
  ExternalLink,
  Trash2,
} from 'lucide-react';

import {
  usePurchaseRequisitions,
  useApproveRequisition,
  useRejectRequisition,
  useConvertRequisitionToPO,
  useSubmitRequisition,
  useBulkApproveRequisitions,
  useBulkRejectRequisitions,
  useDepartments,
  useDeletePurchaseRequisition,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { useAsyncOperation } from '../../hooks/useAsyncOperation';
import { ErrorDisplay } from '../../components/error/ErrorDisplay';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { EnhancedButton } from '../../components/ui/EnhancedButton';
import WorkflowStatusIndicator from '../../components/procurement/WorkflowStatusIndicator';
import {
  PurchaseRequisition,
  RequisitionStatus,
  UrgencyLevel,
  getStatusColor,
  getStatusLabel,
  getUrgencyColor,
  getUrgencyLabel,
} from '../../types/procurement';

const RequisitionListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkflowType, setFilterWorkflowType] = useState('all'); // New workflow type filter
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('-created_at');
  const [selectedRequisitions, setSelectedRequisitions] = useState<number[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // React Query hooks
  const {
    data: requisitionsData,
    isLoading,
    error,
  } = usePurchaseRequisitions({
    search: searchQuery || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
    department_id: filterDepartment === 'all' ? undefined : parseInt(filterDepartment),
    priority: filterPriority === 'all' ? undefined : filterPriority,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ordering: sortBy,
  });

  // const { data: departmentsData } = useDepartments({ is_active: true });

  // Mutations with enhanced error handling
  const submitRequisitionMutation = useSubmitRequisition();
  const approveRequisitionMutation = useApproveRequisition();
  const rejectRequisitionMutation = useRejectRequisition();
  const convertToPOMutation = useConvertRequisitionToPO();
  const bulkApproveMutation = useBulkApproveRequisitions();
  const bulkRejectMutation = useBulkRejectRequisitions();
  const deleteRequisitionMutation = useDeletePurchaseRequisition();

  const requisitions = requisitionsData?.results || [];
  // const departments = departmentsData?.results || [];

  // Filter requisitions by workflow type
  const filteredRequisitions = requisitions.filter(req => {
    if (filterWorkflowType === 'all') return true;
    if (filterWorkflowType === 'workflow') return req.workflow_run_id && req.workflow_run_id > 0;
    if (filterWorkflowType === 'manual') return !req.workflow_run_id || req.workflow_run_id === 0;
    return true;
  });

  const processing =
    submitRequisitionMutation.isPending ||
    approveRequisitionMutation.isPending ||
    rejectRequisitionMutation.isPending ||
    convertToPOMutation.isPending ||
    bulkApproveMutation.isPending ||
    bulkRejectMutation.isPending ||
    deleteRequisitionMutation.isPending;

  // Action handlers using useCallback pattern like PurchaseOrderListPage
  const handleSubmitRequisition = useCallback(
    async (requisitionId: number) => {
      if (!confirm('Submit this requisition for approval?')) return;

      try {
        await submitRequisitionMutation.mutateAsync(requisitionId);
        toast.success('Requisition submitted successfully!');
      } catch (err: unknown) {
        console.error('Failed to submit requisition:', err);
        toast.error('Failed to submit requisition. Please try again.');
      }
    },
    [submitRequisitionMutation, toast]
  );

  const handleApproveRequisition = useCallback(
    async (requisitionId: number) => {
      const comments = prompt('Enter approval comments (optional):');

      try {
        await approveRequisitionMutation.mutateAsync({
          id: requisitionId,
          data: { action: 'approve', comments: comments || undefined },
        });
        toast.success('Requisition approved successfully!');
      } catch (err: unknown) {
        console.error('Failed to approve requisition:', err);
        toast.error('Failed to approve requisition. Please try again.');
      }
    },
    [approveRequisitionMutation, toast]
  );

  const handleRejectRequisition = useCallback(
    async (requisitionId: number) => {
      const comments = prompt('Enter rejection reason:');
      if (!comments) return;

      try {
        await rejectRequisitionMutation.mutateAsync({
          id: requisitionId,
          data: { action: 'reject', comments },
        });
        toast.success('Requisition rejected successfully');
      } catch (err: unknown) {
        console.error('Failed to reject requisition:', err);
        toast.error('Failed to reject requisition. Please try again.');
      }
    },
    [rejectRequisitionMutation, toast]
  );

  const handleConvertToPO = useCallback(
    async (requisitionId: number) => {
      if (!confirm('Convert this approved requisition to a Purchase Order?')) return;

      try {
        const newPO = await convertToPOMutation.mutateAsync(requisitionId);
        toast.success('Requisition converted to Purchase Order successfully!');
        navigate(`/procurement/orders/${newPO.id}/view`);
      } catch (err: unknown) {
        console.error('Failed to convert requisition:', err);
        toast.error('Failed to convert requisition to PO. Please try again.');
      }
    },
    [convertToPOMutation, toast, navigate]
  );

  const handleDeleteRequisition = useCallback(
    async (requisitionId: number) => {
      if (
        !confirm('Are you sure you want to delete this requisition? This action cannot be undone.')
      )
        return;

      try {
        await deleteRequisitionMutation.mutateAsync(requisitionId);
        toast.success('Requisition deleted successfully!');
      } catch (err: unknown) {
        console.error('Failed to delete requisition:', err);
        toast.error('Failed to delete requisition. Please try again.');
      }
    },
    [deleteRequisitionMutation, toast]
  );

  const handleBulkApprove = async () => {
    if (selectedRequisitions.length === 0) return;

    const comments = prompt('Enter approval comments (optional):');

    try {
      const result = await bulkApproveMutation.mutateAsync({
        ids: selectedRequisitions,
        data: { action: 'approve', comments: comments || undefined },
      });

      toast.success(`${result.success.length} requisitions approved successfully!`);
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} requisitions failed to approve`);
      }

      setSelectedRequisitions([]);
      setShowBulkActions(false);
    } catch (err: unknown) {
      console.error('Failed to bulk approve:', err);
      toast.error('Failed to approve requisitions');
    }
  };

  const handleBulkReject = async () => {
    if (selectedRequisitions.length === 0) return;

    const comments = prompt('Enter rejection reason:');
    if (!comments) return;

    try {
      const result = await bulkRejectMutation.mutateAsync({
        ids: selectedRequisitions,
        data: { action: 'reject', comments },
      });

      toast.success(`${result.success.length} requisitions rejected`);
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} requisitions failed to reject`);
      }

      setSelectedRequisitions([]);
      setShowBulkActions(false);
    } catch (err: unknown) {
      console.error('Failed to bulk reject:', err);
      toast.error('Failed to reject requisitions');
    }
  };

  const handleSelectRequisition = (requisitionId: number) => {
    setSelectedRequisitions(prev => {
      const newSelection = prev.includes(requisitionId)
        ? prev.filter(id => id !== requisitionId)
        : [...prev, requisitionId];

      setShowBulkActions(newSelection.length > 0);
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    const approvableRequisitions = requisitions.filter(req => canApprove(req)).map(req => req.id!);

    if (selectedRequisitions.length === approvableRequisitions.length) {
      setSelectedRequisitions([]);
      setShowBulkActions(false);
    } else {
      setSelectedRequisitions(approvableRequisitions);
      setShowBulkActions(approvableRequisitions.length > 0);
    }
  };

  const canApprove = (requisition: PurchaseRequisition) =>
    [RequisitionStatus.SUBMITTED, RequisitionStatus.UNDER_REVIEW].includes(requisition.status) &&
    requisition.items &&
    requisition.items.length > 0;

  const canReject = (requisition: PurchaseRequisition) =>
    [RequisitionStatus.SUBMITTED, RequisitionStatus.UNDER_REVIEW].includes(requisition.status) &&
    requisition.items &&
    requisition.items.length > 0;

  const canEdit = (requisition: PurchaseRequisition) =>
    [RequisitionStatus.DRAFT, RequisitionStatus.REJECTED].includes(requisition.status);

  const canConvertToPO = (requisition: PurchaseRequisition) =>
    requisition.status === RequisitionStatus.APPROVED;

  const getStatusIcon = (status: RequisitionStatus) => {
    const icons = {
      [RequisitionStatus.DRAFT]: FileText,
      [RequisitionStatus.SUBMITTED]: Clock,
      [RequisitionStatus.UNDER_REVIEW]: AlertCircle,
      [RequisitionStatus.APPROVED]: CheckCircle,
      [RequisitionStatus.REJECTED]: XCircle,
      [RequisitionStatus.CONVERTED]: ShoppingCart,
      [RequisitionStatus.CANCELLED]: XCircle,
    };
    const Icon = icons[status] || AlertCircle;
    return <Icon size={16} />;
  };

  const getPriorityIcon = (priority: UrgencyLevel) => {
    return <AlertCircle size={14} style={{ color: getUrgencyColor(priority) }} />;
  };

  if (error) {
    return (
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <ErrorDisplay
          error={error}
          context="fetch-requisitions"
          onRetry={() => window.location.reload()}
          variant="card"
          size="lg"
          showRetry={true}
        />
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
              Purchase Requisitions
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Manage purchase requisitions and approval workflows
            </p>
          </div>
          <button
            onClick={() => navigate('/procurement/requisitions/create')}
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
            Create Requisition
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
              placeholder="Search by PR number, title, or requester..."
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
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '150px',
              }}
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="po_created">PO Created</option>
              <option value="cancelled">Cancelled</option>
              {/* Workflow-specific statuses */}
              <option value="pending">Pending (Workflow)</option>
              <option value="in_progress">In Progress (Workflow)</option>
              <option value="under_review">Under Review (Workflow)</option>
              <option value="completed">Completed (Workflow)</option>
              <option value="failed">Failed (Workflow)</option>
            </select>
          </div>

          <select
            value={filterDepartment}
            onChange={e => setFilterDepartment(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="all">All Departments</option>
            {/* {departments.map(dept => (
              <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>
            ))} */}
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '120px',
            }}
          >
            <option value="all">All Priority</option>
            <option value={UrgencyLevel.LOW}>Low</option>
            <option value={UrgencyLevel.MEDIUM}>Medium</option>
            <option value={UrgencyLevel.HIGH}>High</option>
            <option value={UrgencyLevel.CRITICAL}>Critical</option>
          </select>

          {/* Workflow Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Workflow size={16} style={{ color: '#6b7280' }} />
            <select
              value={filterWorkflowType}
              onChange={e => setFilterWorkflowType(e.target.value)}
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '140px',
              }}
            >
              <option value="all">All Types</option>
              <option value="manual">Manual Process</option>
              <option value="workflow">Automated Workflow</option>
            </select>
          </div>
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
            <option value="pr_number">PR Number</option>
            <option value="title">Title</option>
            <option value="-priority">Highest Priority</option>
            <option value="priority">Lowest Priority</option>
            <option value="-total_estimated_cost">Highest Amount</option>
            <option value="total_estimated_cost">Lowest Amount</option>
          </select>
        </div>

        {/* Workflow Statistics Summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#3b82f6',
                marginBottom: '4px',
              }}
            >
              {filteredRequisitions.length}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Requisitions</div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#8b5cf6',
                marginBottom: '4px',
              }}
            >
              {
                filteredRequisitions.filter(req => req.workflow_run_id && req.workflow_run_id > 0)
                  .length
              }
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Automated Workflow</div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#10b981',
                marginBottom: '4px',
              }}
            >
              {
                filteredRequisitions.filter(
                  req => !req.workflow_run_id || req.workflow_run_id === 0
                ).length
              }
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Manual Process</div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#f59e0b',
                marginBottom: '4px',
              }}
            >
              {
                filteredRequisitions.filter(
                  req =>
                    ['submitted', 'pending', 'in_progress', 'under_review'].includes(req.status) ||
                    (req.workflow_status &&
                      ['pending', 'in_progress', 'under_review'].includes(req.workflow_status))
                ).length
              }
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Pending Approval</div>
          </div>
        </div>
        {showBulkActions && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              background: '#f3f4f6',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
              {selectedRequisitions.length} requisition
              {selectedRequisitions.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBulkApprove}
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
              Bulk Approve
            </button>
            <button
              onClick={handleBulkReject}
              disabled={processing}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: processing ? '#9ca3af' : '#ef4444',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <XCircle size={14} />
              Bulk Reject
            </button>
            <button
              onClick={() => {
                setSelectedRequisitions([]);
                setShowBulkActions(false);
              }}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Requisitions Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ color: '#6b7280' }}>Loading purchase requisitions...</div>
        </div>
      ) : filteredRequisitions.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            background: '#f9fafb',
            borderRadius: '12px',
          }}
        >
          <FileText size={64} style={{ margin: '0 auto 24px', color: '#d1d5db' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#374151' }}>
            No Purchase Requisitions Found
          </h3>
          <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
            {searchQuery ||
            filterStatus !== 'all' ||
            filterDepartment !== 'all' ||
            filterPriority !== 'all' ||
            filterWorkflowType !== 'all'
              ? 'No requisitions match your current filters.'
              : 'Get started by creating your first purchase requisition.'}
          </p>
          <button
            onClick={() => navigate('/procurement/requisitions/create')}
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
            Create Requisition
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Select All Header */}
          {canUserApprove && requisitions.some(req => canApprove(req)) && (
            <div
              style={{
                background: '#f8fafc',
                padding: '12px 16px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <input
                type="checkbox"
                checked={
                  selectedRequisitions.length ===
                    requisitions.filter(req => canApprove(req)).length &&
                  requisitions.filter(req => canApprove(req)).length > 0
                }
                onChange={handleSelectAll}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                Select all approvable requisitions
              </span>
            </div>
          )}

          {filteredRequisitions.map(requisition => (
            <div
              key={requisition.id}
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                  {canUserApprove && canApprove(requisition) && (
                    <input
                      type="checkbox"
                      checked={selectedRequisitions.includes(requisition.id!)}
                      onChange={() => handleSelectRequisition(requisition.id!)}
                      style={{ marginTop: '4px', cursor: 'pointer' }}
                    />
                  )}

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
                      <h3
                        style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
                      >
                        {requisition.pr_number}
                      </h3>

                      {/* Workflow Status Indicator */}
                      <WorkflowStatusIndicator
                        status={requisition.status}
                        workflowRunId={requisition.workflow_run_id}
                        workflowStatus={requisition.workflow_status}
                        size="small"
                        showLabel={true}
                      />

                      {/* Priority indicator - only show if priority field exists */}
                      {requisition.priority && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: `${getUrgencyColor(requisition.priority)}20`,
                            color: getUrgencyColor(requisition.priority),
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {getPriorityIcon(requisition.priority)}
                          {getUrgencyLabel(requisition.priority)}
                        </div>
                      )}
                    </div>

                    <h4
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: '#374151',
                      }}
                    >
                      {requisition.purpose}
                    </h4>

                    <div
                      style={{
                        display: 'flex',
                        gap: '24px',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                      }}
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
                        <strong>Requester:</strong> {requisition.requested_by_name || 'Unknown'}
                      </p>
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
                        <strong>Department:</strong> {requisition.department || 'Unknown'}
                      </p>
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
                        <strong>Created:</strong>{' '}
                        {new Date(requisition.created_at).toLocaleDateString()}
                      </p>
                      {/* Workflow Information */}
                      {requisition.workflow_run_id && requisition.workflow_run_id > 0 && (
                        <p
                          style={{
                            margin: 0,
                            color: '#8b5cf6',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Workflow size={14} />
                          <strong>Workflow Run:</strong> #{requisition.workflow_run_id}
                        </p>
                      )}
                    </div>

                    {requisition.required_by_date && (
                      <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                        <strong>Required By:</strong>{' '}
                        {new Date(requisition.required_by_date).toLocaleDateString()}
                      </p>
                    )}

                    <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                      <strong>Items:</strong> {requisition.items.length} item
                      {requisition.items.length !== 1 ? 's' : ''}
                    </p>

                    {/* Additional workflow information */}
                    {requisition.workflow_run_id && requisition.workflow_status && (
                      <p style={{ margin: '0 0 8px 0', color: '#8b5cf6', fontSize: '14px' }}>
                        <strong>Workflow Status:</strong>{' '}
                        {requisition.workflow_status.charAt(0).toUpperCase() +
                          requisition.workflow_status.slice(1)}
                      </p>
                    )}

                    {requisition.approved_by_name && requisition.approved_at && (
                      <p style={{ margin: '0 0 8px 0', color: '#10b981', fontSize: '14px' }}>
                        <strong>Approved by:</strong> {requisition.approved_by_name} on{' '}
                        {new Date(requisition.approved_at).toLocaleDateString()}
                      </p>
                    )}

                    {requisition.rejection_reason && (
                      <p style={{ margin: '0 0 8px 0', color: '#ef4444', fontSize: '14px' }}>
                        <strong>Rejection Reason:</strong> {requisition.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#1f2937',
                      marginBottom: '4px',
                    }}
                  >
                    ₦{parseFloat(requisition.estimated_total || '0').toLocaleString()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Estimated Cost</div>
                </div>
              </div>

              {/* Justification */}
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '6px',
                }}
              >
                <p style={{ margin: 0, fontSize: '14px', color: '#374151', fontStyle: 'italic' }}>
                  "{requisition.purpose}"
                </p>
              </div>

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
                  onClick={() => navigate(`/procurement/requisitions/${requisition.id}/view`)}
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

                {canEdit(requisition) && (
                  <button
                    onClick={() => navigate(`/procurement/requisitions/${requisition.id}/edit`)}
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

                {/* <EnhancedButton
                  buttonId={`delete-btn-${requisition.id}`}
                  onClick={() => {
                    console.log('delete button')
                    
                    handleDeleteRequisition.execute(requisition.id!)
                  
                  }}
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  loadingText="Deleting..."
                >
                  Delete
                </EnhancedButton> */}
                <EnhancedButton
                  buttonId={`delete-btn-${requisition.id}`}
                  onClick={async () => {
                    console.log('Direct onClick handler running');

                    if (!confirm('Are you sure you want to delete this requisition?')) {
                      console.log('User cancelled');
                      return;
                    }

                    console.log('Calling delete mutation directly');
                    try {
                      await deleteRequisitionMutation.mutateAsync(requisition.id!);
                      console.log('Delete successful');
                      toast.success('Requisition deleted!');
                    } catch (error) {
                      console.error('Delete failed:', error);
                      toast.error('Delete failed');
                    }
                  }}
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  loadingText="Deleting..."
                >
                  Delete
                </EnhancedButton>

                {canUserApprove && canApprove(requisition) && !requisition.workflow_run_id && (
                  <EnhancedButton
                    buttonId={`approve-btn-${requisition.id}`}
                    onClick={async () => {
                      const comments = prompt('Enter approval comments (optional):');
                      try {
                        await approveRequisitionMutation.mutateAsync({
                          id: requisition.id!,
                          data: { action: 'approve', comments: comments || undefined },
                        });
                        toast.success('Requisition approved successfully!');
                      } catch (error) {
                        console.error('Approve failed:', error);
                        toast.error('Failed to approve requisition');
                      }
                    }}
                    variant="success"
                    size="sm"
                    icon={<CheckCircle size={14} />}
                    loadingText="Approving..."
                  >
                    Approve
                  </EnhancedButton>
                )}

                {canReject(requisition) && !requisition.workflow_run_id && (
                  <EnhancedButton
                    buttonId={`reject-btn-${requisition.id}`}
                    onClick={async () => {
                      const comments = prompt('Enter rejection reason:');
                      if (!comments) {
                        toast.error('Rejection reason is required');
                        return;
                      }
                      try {
                        await rejectRequisitionMutation.mutateAsync({
                          id: requisition.id!,
                          data: { action: 'reject', comments },
                        });
                        toast.success('Requisition rejected successfully');
                      } catch (error) {
                        console.error('Reject failed:', error);
                        toast.error('Failed to reject requisition');
                      }
                    }}
                    variant="danger"
                    size="sm"
                    icon={<XCircle size={14} />}
                    loadingText="Rejecting..."
                  >
                    Reject
                  </EnhancedButton>
                )}

                {/* Workflow-specific action buttons */}
                {requisition.workflow_run_id && requisition.workflow_run_id > 0 && (
                  <>
                    <button
                      onClick={() =>
                        navigate(`/approvals/inbox?workflow_run_id=${requisition.workflow_run_id}`)
                      }
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #8b5cf6',
                        borderRadius: '6px',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#8b5cf6',
                      }}
                    >
                      <ExternalLink size={14} />
                      View in Approval Inbox
                    </button>

                    {/* Show workflow status info */}
                    {requisition.workflow_status && (
                      <div
                        style={{
                          padding: '6px 12px',
                          background: '#f3f4f6',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: '#6b7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Workflow size={12} />
                        Run #{requisition.workflow_run_id}
                      </div>
                    )}
                  </>
                )}
                {/*
                 */}

                {requisition.status === 'draft' && (
                  <EnhancedButton
                    buttonId={`submit-btn-${requisition.id}`}
                    onClick={() => handleSubmitRequisition.execute(requisition.id!)}
                    variant="primary"
                    size="sm"
                    icon={<Clock size={14} />}
                    loadingText="Submitting..."
                  >
                    Submit
                  </EnhancedButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {requisitionsData && (requisitionsData.next || requisitionsData.previous) && (
        <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {requisitionsData.previous && (
            <button
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Previous
            </button>
          )}
          {requisitionsData.next && (
            <button
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RequisitionListPage;
