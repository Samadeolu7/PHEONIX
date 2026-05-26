// src/pages/inventory/SalesOrderDetailPage.tsx
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  ArrowLeft,
  Package,
  Calendar,
  User,
  FileText,
  CheckCircle,
  Send,
  ThumbsUp,
  ThumbsDown,
  Ban,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { inventoryService, SalesOrderStatus } from '../../services/inventoryService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SalesOrderStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700', icon: <FileText size={14} /> },
  pending_approval: {
    label: 'Pending Approval',
    cls: 'bg-amber-100 text-amber-700',
    icon: <Send size={14} />,
  },
  approved: {
    label: 'Approved',
    cls: 'bg-emerald-100 text-emerald-700',
    icon: <ThumbsUp size={14} />,
  },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700', icon: <ThumbsDown size={14} /> },
  confirmed: {
    label: 'Confirmed',
    cls: 'bg-blue-100 text-blue-700',
    icon: <CheckCircle size={14} />,
  },
  processing: {
    label: 'Processing',
    cls: 'bg-yellow-100 text-yellow-700',
    icon: <Package size={14} />,
  },
  partially_delivered: {
    label: 'Partially Delivered',
    cls: 'bg-indigo-100 text-indigo-700',
    icon: <Package size={14} />,
  },
  shipped: { label: 'Shipped', cls: 'bg-purple-100 text-purple-700', icon: <Package size={14} /> },
  delivered: {
    label: 'Delivered',
    cls: 'bg-green-100 text-green-700',
    icon: <CheckCircle size={14} />,
  },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: <Ban size={14} /> },
};

const fmt = (n: string | number | undefined) => {
  const val = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(val);
};

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ─── Component ──────────────────────────────────────────────────────────────────

const SalesOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { userWithRole, isAdmin } = useAuth();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const isApprover =
    isAdmin ||
    !!userWithRole?.is_staff ||
    (userWithRole?.permissions ?? []).some((p: string) => p.includes('approve'));

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sales-order', id],
    queryFn: () => inventoryService.getSalesOrder(Number(id)),
    enabled: !!id,
  });

  const invalidateAndRefetch = async () => {
    await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    await refetch();
  };

  const handleAction = async (action: string, fn: () => Promise<any>, successMsg: string) => {
    setActionLoading(action);
    try {
      await fn();
      toast.success(successMsg);
      await invalidateAndRefetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Action failed';
      toast.error(msg);
    } finally {
      setActionLoading(action === 'reject' ? '' : null);
      setShowRejectModal(false);
      setShowCancelModal(false);
      setActionNotes('');
      setCancelReason('');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading sales order…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-500 gap-4">
        <AlertTriangle size={32} className="text-red-400" />
        <p>Failed to load sales order</p>
        <Link to="/inventory/sales-orders" className="text-blue-600 hover:underline text-sm">
          ← Back to list
        </Link>
      </div>
    );
  }

  const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
  const orderNumber = order.so_number || (order as any).order_number || `SO-${order.id}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link
              to="/inventory/sales-orders"
              className="hover:text-blue-600 flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Sales Orders
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{orderNumber}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart size={24} className="text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{orderNumber}</h1>
                <p className="text-sm text-gray-500">{order.client_name || 'No client'}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${sc.cls}`}
              >
                {sc.icon} {sc.label}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {order.status === 'draft' && (
                <button
                  disabled={!!actionLoading}
                  onClick={() =>
                    handleAction(
                      'submit',
                      () => inventoryService.submitSalesOrder(order.id),
                      'Sales order submitted'
                    )
                  }
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === 'submit' ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Submit for Approval
                </button>
              )}

              {order.status === 'pending_approval' && isApprover && (
                <>
                  <button
                    disabled={!!actionLoading}
                    onClick={() =>
                      handleAction(
                        'approve',
                        () =>
                          inventoryService.approveSalesOrder(order.id, actionNotes || undefined),
                        'Sales order approved'
                      )
                    }
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'approve' ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <ThumbsUp size={14} />
                    )}
                    Approve
                  </button>
                  <button
                    disabled={!!actionLoading}
                    onClick={() => setShowRejectModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <ThumbsDown size={14} />
                    Reject
                  </button>
                </>
              )}

              {order.status === 'approved' && (
                <button
                  disabled={!!actionLoading}
                  onClick={() =>
                    handleAction(
                      'confirm',
                      () => inventoryService.confirmSalesOrder(order.id),
                      'Sales order confirmed'
                    )
                  }
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === 'confirm' ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  Confirm Order
                </button>
              )}

              {!['delivered', 'cancelled'].includes(order.status) && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => setShowCancelModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Ban size={14} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Calendar size={14} /> Order Date
            </div>
            <p className="font-medium text-gray-900">{fmtDate(order.order_date)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Calendar size={14} /> Expected Delivery
            </div>
            <p className="font-medium text-gray-900">{fmtDate(order.expected_delivery_date)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Package size={14} /> Items
            </div>
            <p className="font-medium text-gray-900">{order.items?.length ?? 0}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ShoppingCart size={14} /> Total Amount
            </div>
            <p className="font-semibold text-gray-900 text-lg">{fmt(order.total_amount)}</p>
          </div>
        </div>

        {/* Approval Info */}
        {order.approved_by_name && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <User size={14} /> Approval Info
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Approved By:</span>
                <span className="ml-2 font-medium text-gray-900">{order.approved_by_name}</span>
              </div>
              <div>
                <span className="text-gray-500">Approved At:</span>
                <span className="ml-2 font-medium text-gray-900">{fmtDate(order.approved_at)}</span>
              </div>
              {order.approval_notes && (
                <div>
                  <span className="text-gray-500">Notes:</span>
                  <span className="ml-2 text-gray-700">{order.approval_notes}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-medium text-gray-700 flex items-center gap-1.5">
              <Package size={14} /> Order Items
            </h3>
          </div>
          {order.items && order.items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Item</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Discount</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                  {['processing', 'partially_delivered', 'shipped', 'delivered'].includes(
                    order.status
                  ) && (
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Delivered</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.item_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {item.item_sku || item.sku || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(item.unit_price)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {item.discount ? fmt(item.discount) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {fmt(item.total_price)}
                    </td>
                    {['processing', 'partially_delivered', 'shipped', 'delivered'].includes(
                      order.status
                    ) && (
                      <td className="px-4 py-2.5 text-right text-gray-700">
                        {item.quantity_delivered ?? 0}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                {order.subtotal && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right text-gray-500">
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-700">
                      {fmt(order.subtotal)}
                    </td>
                  </tr>
                )}
                {order.discount && parseFloat(order.discount) > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right text-gray-500">
                      Discount
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-red-600">
                      -{fmt(order.discount)}
                    </td>
                  </tr>
                )}
                {order.tax_amount && parseFloat(order.tax_amount) > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right text-gray-500">
                      Tax
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-700">
                      {fmt(order.tax_amount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={6} className="px-4 py-2.5 text-right font-semibold text-gray-700">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 text-base">
                    {fmt(order.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Package size={32} className="mb-2 opacity-40" />
              <p>No items in this order</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <FileText size={14} /> Notes
            </h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-gray-400 flex gap-4">
          <span>Created: {fmtDate(order.created_at)}</span>
          <span>Updated: {fmtDate(order.updated_at)}</span>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reject Sales Order</h3>
            <p className="text-sm text-gray-500">
              Are you sure you want to reject <span className="font-medium">{orderNumber}</span>?
            </p>
            <textarea
              rows={3}
              placeholder="Reason for rejection (optional)"
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setActionNotes('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading === 'reject'}
                onClick={() =>
                  handleAction(
                    'reject',
                    () => inventoryService.rejectSalesOrder(order.id, actionNotes || undefined),
                    'Sales order rejected'
                  )
                }
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Cancel Sales Order</h3>
            <p className="text-sm text-gray-500">
              Are you sure you want to cancel <span className="font-medium">{orderNumber}</span>?
              This action cannot be undone.
            </p>
            <textarea
              rows={3}
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading === 'cancel'}
                onClick={() =>
                  handleAction(
                    'cancel',
                    () => inventoryService.cancelSalesOrder(order.id, cancelReason || undefined),
                    'Sales order cancelled'
                  )
                }
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesOrderDetailPage;
