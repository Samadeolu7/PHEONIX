/**
 * Petty Cash Replenishment List Page
 * View all reimbursement requests and take workflow actions inline.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  RefreshCwIcon,
  PlusIcon,
  ChevronRightIcon,
  ClockIcon,
  CheckCircle2Icon,
  XCircleIcon,
  FileCheckIcon,
  SearchIcon,
  FilterIcon,
} from 'lucide-react';
import {
  usePettyCashReplenishments,
  useVerifyReplenishment,
  useApproveReplenishment,
  useRejectReplenishment,
  usePostReplenishment,
} from '../../hooks/usePettyCash';
import { PettyCashReplenishment } from '../../types/pettyCash';

/* ── Status helpers ──────────────────────────────────────────────────────── */
const STATUS_INFO: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-800', icon: ClockIcon, label: 'Draft' },
  submitted: { color: 'bg-yellow-100 text-yellow-800', icon: ClockIcon, label: 'Submitted' },
  under_review: { color: 'bg-blue-100 text-blue-800', icon: FileCheckIcon, label: 'Under Review' },
  approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle2Icon, label: 'Approved' },
  rejected: { color: 'bg-red-100 text-red-800', icon: XCircleIcon, label: 'Rejected' },
  posted: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle2Icon, label: 'Posted' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const info = STATUS_INFO[status] ?? {
    color: 'bg-gray-100 text-gray-700',
    icon: ClockIcon,
    label: status,
  };
  const Icon = info.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${info.color}`}
    >
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
};

/* ── Action dialog ───────────────────────────────────────────────────────── */
type ActionType = 'verify' | 'approve' | 'reject' | 'post' | null;

interface ActionDialogProps {
  type: ActionType;
  replenishment: PettyCashReplenishment;
  onClose: () => void;
  onSuccess: () => void;
}

const ActionDialog: React.FC<ActionDialogProps> = ({ type, replenishment, onClose, onSuccess }) => {
  const [notes, setNotes] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const verifyMutation = useVerifyReplenishment();
  const approveMutation = useApproveReplenishment();
  const rejectMutation = useRejectReplenishment();
  const postMutation = usePostReplenishment();

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      switch (type) {
        case 'verify':
          await verifyMutation.mutateAsync({ id: replenishment.id, data: { notes } });
          break;
        case 'approve': {
          const data: any = { notes };
          if (approvedAmount) data.approved_amount = approvedAmount;
          await approveMutation.mutateAsync({ id: replenishment.id, data });
          break;
        }
        case 'reject':
          if (!notes.trim()) {
            setError('Rejection reason is required');
            setSubmitting(false);
            return;
          }
          await rejectMutation.mutateAsync({ id: replenishment.id, data: { reason: notes } });
          break;
        case 'post':
          await postMutation.mutateAsync(replenishment.id);
          break;
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || `Action failed`);
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<NonNullable<ActionType>, string> = {
    verify: 'Verify Reimbursement',
    approve: 'Approve Reimbursement',
    reject: 'Reject Reimbursement',
    post: 'Post to General Ledger',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">{titles[type!]}</h3>
        <p className="text-sm text-gray-600">
          <span className="font-medium">{replenishment.replenishment_number}</span> — ₦
          {parseFloat(replenishment.replenishment_amount).toLocaleString()}
        </p>

        {type === 'post' ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This will create an irreversible journal entry and restore the fund balance. Continue?
          </p>
        ) : (
          <>
            {type === 'approve' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approved Amount{' '}
                  <span className="text-gray-400 font-normal">
                    (leave blank to approve full amount)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">₦</span>
                  <input
                    type="number"
                    value={approvedAmount}
                    onChange={e => setApprovedAmount(e.target.value)}
                    placeholder={
                      replenishment.requested_amount ?? replenishment.replenishment_amount
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {type === 'reject' ? 'Rejection Reason *' : 'Notes'}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={
                  type === 'reject' ? 'State the reason for rejection...' : 'Optional comments...'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 ${
              type === 'reject'
                ? 'bg-red-600 hover:bg-red-700'
                : type === 'post'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting
              ? 'Processing…'
              : type === 'verify'
                ? 'Confirm Verification'
                : type === 'approve'
                  ? 'Approve'
                  : type === 'reject'
                    ? 'Reject'
                    : 'Post to GL'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main list page ──────────────────────────────────────────────────────── */
export const PettyCashReplenishmentList: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ type: ActionType; item: PettyCashReplenishment } | null>(
    null
  );

  const {
    data: replenishments = [],
    isLoading,
    refetch,
  } = usePettyCashReplenishments(statusFilter ? { status: statusFilter } : undefined);

  const filtered = replenishments.filter(
    r =>
      !search ||
      r.replenishment_number.toLowerCase().includes(search.toLowerCase()) ||
      r.fund_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openDialog = (type: ActionType, item: PettyCashReplenishment, e: React.MouseEvent) => {
    e.stopPropagation();
    setDialog({ type, item });
  };

  /* Determine which action buttons to show for a given status */
  const actions = (r: PettyCashReplenishment) => {
    switch (r.status) {
      case 'submitted':
        return [
          {
            type: 'verify' as ActionType,
            label: 'Verify',
            cls: 'bg-blue-600 hover:bg-blue-700 text-white',
          },
        ];
      case 'under_review':
        return [
          {
            type: 'approve' as ActionType,
            label: 'Approve',
            cls: 'bg-green-600 hover:bg-green-700 text-white',
          },
          {
            type: 'reject' as ActionType,
            label: 'Reject',
            cls: 'bg-red-100 hover:bg-red-200 text-red-700',
          },
        ];
      case 'approved':
        return [
          {
            type: 'post' as ActionType,
            label: 'Post to GL',
            cls: 'bg-purple-600 hover:bg-purple-700 text-white',
          },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <RefreshCwIcon className="h-8 w-8" />
            Reimbursement Requests
          </h1>
          <p className="text-gray-600 mt-1">Review, verify and approve petty cash reimbursements</p>
        </div>
        <button
          onClick={() => navigate('/treasury/petty-cash/replenishments/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          New Request
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by number or fund…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="posted">Posted</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow border border-dashed border-gray-300">
          <RefreshCwIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No reimbursement requests found</p>
          <p className="text-sm text-gray-400 mt-1">Create a new request to get started</p>
          <button
            onClick={() => navigate('/treasury/petty-cash/replenishments/new')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            New Request
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fund
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/treasury/petty-cash/replenishments/${r.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-medium text-blue-700">
                      {r.replenishment_number}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{r.fund_name ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {r.replenishment_date
                      ? format(new Date(r.replenishment_date), 'MMM dd, yyyy')
                      : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-medium">
                    ₦{parseFloat(r.requested_amount ?? r.replenishment_amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-500">
                    {r.approved_amount ? `₦${parseFloat(r.approved_amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div
                      className="flex justify-end items-center gap-2"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions(r).map(a => (
                        <button
                          key={a.type}
                          onClick={e => openDialog(a.type, r, e)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${a.cls}`}
                        >
                          {a.label}
                        </button>
                      ))}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/treasury/petty-cash/replenishments/${r.id}`);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="View details"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline action dialog */}
      {dialog && (
        <ActionDialog
          type={dialog.type}
          replenishment={dialog.item}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};
