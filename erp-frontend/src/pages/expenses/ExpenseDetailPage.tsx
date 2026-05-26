import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, CheckCircle, XCircle, Send, BookOpen, AlertTriangle } from 'lucide-react';
import {
  useExpense,
  useSubmitExpense,
  useApproveExpense,
  useRejectExpense,
  usePostExpense,
} from '../../hooks/useExpenses';
import { useToast } from '../../contexts/ToastContext';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { ExpenseStatus } from '../../types/expense';

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  submitted: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  paid: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

const ExpenseDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);

  const expenseId = parseInt(id || '0');
  const { data: expense, isLoading, refetch } = useExpense(expenseId);
  const submitMutation = useSubmitExpense();
  const approveMutation = useApproveExpense();
  const rejectMutation = useRejectExpense();
  const postMutation = usePostExpense();

  const formatCurrency = (amount: string | number) =>
    `₦${parseFloat(amount?.toString() || '0').toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  const formatDate = (dateStr?: string | null) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(expenseId);
      toast.success('Expense submitted for approval');
      refetch();
    } catch {
      toast.error('Failed to submit expense');
    }
  };

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({ id: expenseId, notes: approvalNotes });
      toast.success('Expense approved');
      setShowApproveModal(false);
      refetch();
    } catch {
      toast.error('Failed to approve expense');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      await rejectMutation.mutateAsync({ id: expenseId, reason: rejectReason });
      toast.success('Expense rejected');
      setShowRejectModal(false);
      refetch();
    } catch {
      toast.error('Failed to reject expense');
    }
  };

  const handlePost = async () => {
    try {
      await postMutation.mutateAsync(expenseId);
      toast.success('Expense posted to GL');
      refetch();
    } catch {
      toast.error('Failed to post expense');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse h-10 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <p className="text-gray-600">Expense not found</p>
        <button
          onClick={() => navigate('/expenses')}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          Back to Expenses
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/expenses')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Back to Expenses"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {expense.reference_number || `EXP-${expense.id}`}
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[expense.status]}`}
              >
                {expense.status.toUpperCase()}
              </span>
              {expense.is_posted && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-xs font-semibold">
                  POSTED
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{expense.description}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {expense.status === 'draft' && (
            <>
              <button
                onClick={() => navigate(`/expenses/${expense.id}/edit`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Submit
              </button>
            </>
          )}
          {expense.status === 'submitted' && canUserApprove && (
            <>
              <button
                onClick={() => setShowApproveModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </>
          )}
          {expense.status === 'approved' && !expense.is_posted && (
            <button
              onClick={handlePost}
              disabled={postMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <BookOpen className="w-4 h-4" />
              Post to GL
            </button>
          )}
        </div>
      </div>

      {/* Main Details */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Expense Details</h2>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Category</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{expense.category_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Expense Type</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">
              {expense.expense_type.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Expense Date</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {formatDate(expense.expense_date)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Payment Method</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">
              {expense.payment_method.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Payee</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {expense.payee_name || '—'}{' '}
              {expense.payee_name && (
                <span className="text-xs text-gray-400 capitalize">({expense.payee_type})</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Payment Reference</p>
            <p className="text-sm font-mono text-gray-900 mt-0.5">
              {expense.payment_reference || '—'}
            </p>
          </div>
          {expense.bank_account && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Bank Account</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">
                {expense.bank_name} — {expense.bank_account_number}
              </p>
              {expense.bank_account_name && (
                <p className="text-xs text-gray-500">{expense.bank_account_name}</p>
              )}
            </div>
          )}
        </div>

        {/* Amount Section */}
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Subtotal</span>
            <span className="text-sm font-mono">
              {formatCurrency(expense.subtotal || expense.amount)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm text-gray-500">Tax</span>
            <span className="text-sm font-mono">
              {formatCurrency(expense.tax_amount_field || 0)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
            <span className="text-base font-semibold text-gray-800">Total Amount</span>
            <span className="text-base font-bold text-gray-900 font-mono">
              {formatCurrency(expense.total_amount || expense.amount)}
            </span>
          </div>
        </div>
      </div>

      {/* Approval Info */}
      {expense.approved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Approved</span>
          </div>
          <p className="text-xs text-green-700">
            Approved by <strong>{expense.approved_by_name}</strong> on{' '}
            {formatDate(expense.approved_at)}
          </p>
        </div>
      )}

      {/* GL Posting Info */}
      {expense.is_posted && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-800 mb-2">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm font-semibold">Posted to General Ledger</span>
          </div>
          <p className="text-xs text-purple-700">Posted on {formatDate(expense.posted_at)}</p>
          <div className="mt-2 text-xs text-purple-600 font-mono bg-purple-100 rounded-lg p-2">
            Dr. {expense.category_name} (Expense Account)
            <br />
            &nbsp;&nbsp;Cr.{' '}
            {expense.payment_method === 'cash'
              ? 'Cash'
              : expense.bank_account
                ? `${expense.bank_name} — ${expense.bank_account_number}`
                : 'Bank Account'}{' '}
            / AP
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Approve Expense</h3>
            <textarea
              rows={3}
              value={approvalNotes}
              onChange={e => setApprovalNotes(e.target.value)}
              placeholder="Optional approval notes..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowApproveModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                Confirm Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Reject Expense</h3>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseDetailPage;
