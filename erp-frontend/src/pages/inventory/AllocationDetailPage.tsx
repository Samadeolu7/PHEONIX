// src/pages/inventory/AllocationDetailPage.tsx
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  ArrowLeft,
  Package,
  Calendar,
  User,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Pending Payment', cls: 'bg-gray-100 text-gray-700' },
  partial_access: { label: 'Partial Access', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  partially_used: { label: 'Partially Used', cls: 'bg-blue-100 text-blue-700' },
  exhausted: { label: 'Exhausted', cls: 'bg-purple-100 text-purple-700' },
  expired: { label: 'Expired', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const fmt = (n: string | number | undefined) => {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(v);
};

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const AllocationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const {
    data: allocation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['allocation', id],
    queryFn: () => inventoryService.getAllocation(Number(id)),
    enabled: !!id,
  });

  const { data: itemsData } = useQuery({
    queryKey: ['allocation-items', id],
    queryFn: () => inventoryService.getAllocationItems(Number(id)),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (error || !allocation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-500 gap-4">
        <AlertTriangle size={32} className="text-red-400" />
        <p>Failed to load allocation</p>
        <Link to="/inventory/allocations" className="text-blue-600 hover:underline text-sm">
          ← Back to list
        </Link>
      </div>
    );
  }

  const sb = STATUS_BADGES[allocation.status] || STATUS_BADGES.active;
  const items = itemsData?.data ?? allocation.items ?? [];
  const allocated = parseFloat(allocation.allocated_amount || '0');
  const consumed = parseFloat(allocation.consumed_amount || '0');
  const remaining = parseFloat(allocation.remaining_amount || '0');
  const pctUsed = allocated > 0 ? Math.round((consumed / allocated) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link
              to="/inventory/allocations"
              className="hover:text-blue-600 flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Allocations
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{allocation.allocation_number}</span>
          </div>
          <div className="flex items-center gap-3">
            <Layers size={24} className="text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{allocation.allocation_number}</h1>
              <p className="text-sm text-gray-500">{allocation.client_name}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${sb.cls}`}
            >
              {sb.label}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Package size={14} /> Allocation Type
            </div>
            <p className="font-medium text-gray-900 capitalize">
              {allocation.allocation_type?.replace('_', ' ')}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <CheckCircle size={14} /> Allocated Amount
            </div>
            <p className="font-semibold text-gray-900">{fmt(allocated)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Clock size={14} /> Consumed
            </div>
            <p className="font-semibold text-gray-900">{fmt(consumed)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Layers size={14} /> Remaining
            </div>
            <p className="font-semibold text-emerald-600">{fmt(remaining)}</p>
          </div>
        </div>

        {/* Usage Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Usage</span>
            <span className="text-sm text-gray-500">{pctUsed}% consumed</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${pctUsed >= 90 ? 'bg-red-500' : pctUsed >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(pctUsed, 100)}%` }}
            />
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Valid From:</span>
              <p className="font-medium text-gray-900">{fmtDate(allocation.valid_from)}</p>
            </div>
            <div>
              <span className="text-gray-500">Valid Until:</span>
              <p className="font-medium text-gray-900">
                {allocation.valid_until ? fmtDate(allocation.valid_until) : 'No Expiry'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Client:</span>
              <p className="font-medium text-gray-900">{allocation.client_name}</p>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <p className="font-medium text-gray-900">{fmtDate(allocation.created_at)}</p>
            </div>
          </div>
          {allocation.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">Notes:</span>
              <p className="text-sm text-gray-700 mt-1">{allocation.notes}</p>
            </div>
          )}
        </div>

        {/* Allocated Items */}
        {items.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-700 flex items-center gap-1.5">
                <Package size={14} /> Allocated Items
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Item</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                    Allocated Qty
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Consumed Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item: Record<string, unknown>, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {(item.item_name as string) ||
                        (item.category_name as string) ||
                        `Item #${(item.item as number) || idx + 1}`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {String(item.allocated_quantity ?? item.quantity ?? '—')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {String(item.consumed_quantity ?? '0')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-600">
                      {String(item.remaining_quantity ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Usage Rules */}
        {allocation.usage_rules && Object.keys(allocation.usage_rules).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <User size={14} /> Usage Rules
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(allocation.usage_rules).map(([key, value]) => (
                <div key={key}>
                  <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="ml-2 font-medium text-gray-900">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllocationDetailPage;
