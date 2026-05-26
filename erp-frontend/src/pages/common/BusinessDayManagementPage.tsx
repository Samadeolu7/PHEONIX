// src/pages/common/BusinessDayManagementPage.tsx
/**
 * Business Day Management
 * Feature #3 — EOD close/reopen + back-date requests
 *
 * Route: /business-day
 *
 * Roles:
 *   branch_manager / supervisor: close day, approve/reject backdate requests
 *   director / admin:            reopen day
 *   credit_officer / operations: submit backdate requests
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  businessDayService,
  BusinessDay,
  BackdateRequest,
  BackdateRequestStatus,
} from '../../services/businessDayService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Plus,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';

const STATUS_BD_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  closed: 'bg-red-100 text-red-800',
};

const STATUS_BK_COLORS: Record<BackdateRequestStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

const BusinessDayManagementPage: React.FC = () => {
  const { selectedRole } = useAuth();
  const { success, error: showError } = useToast();

  const [days, setDays] = useState<BusinessDay[]>([]);
  const [requests, setRequests] = useState<BackdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<number | 'close' | null>(null);

  // Backdate request form
  const [showBdForm, setShowBdForm] = useState(false);
  const [bdTargetDate, setBdTargetDate] = useState('');
  const [bdReason, setBdReason] = useState('');

  // Reopen form
  const [reopenDayId, setReopenDayId] = useState<number | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  // Reject form
  const [rejectReqId, setRejectReqId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const canManageDay = selectedRole && ['branch_manager', 'supervisor', 'director', 'admin'].includes(selectedRole);
  const canReopen = selectedRole && ['director', 'admin'].includes(selectedRole);
  const canApproveRequests = selectedRole && ['branch_manager', 'supervisor', 'director', 'admin'].includes(selectedRole);
  const canRequestBackdate = selectedRole && ['credit_officer', 'operations', 'branch_manager'].includes(selectedRole);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        businessDayService.listBusinessDays(),
        businessDayService.listBackdateRequests(),
      ]);
      setDays(d);
      setRequests(r);
    } catch {
      showError('Failed to load business day data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCloseDay = async () => {
    try {
      setSubmitting('close');
      const bd = await businessDayService.closeDay();
      setDays((prev) => {
        const idx = prev.findIndex((d) => d.id === bd.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = bd;
          return next;
        }
        return [bd, ...prev];
      });
      success('Business day closed');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to close business day');
    } finally {
      setSubmitting(null);
    }
  };

  const handleReopen = async () => {
    if (!reopenDayId || !reopenReason.trim()) {
      showError('A reason is required to reopen a day');
      return;
    }
    try {
      setSubmitting(reopenDayId);
      const bd = await businessDayService.reopenDay(reopenDayId, reopenReason);
      setDays((prev) => prev.map((d) => (d.id === bd.id ? bd : d)));
      setReopenDayId(null);
      setReopenReason('');
      success('Business day reopened');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to reopen day');
    } finally {
      setSubmitting(null);
    }
  };

  const handleCreateBackdateRequest = async () => {
    if (!bdTargetDate || !bdReason.trim()) {
      showError('Date and reason are required');
      return;
    }
    try {
      setSubmitting(-1);
      const req = await businessDayService.createBackdateRequest({
        target_date: bdTargetDate,
        reason: bdReason,
      });
      setRequests((prev) => [req, ...prev]);
      setShowBdForm(false);
      setBdTargetDate('');
      setBdReason('');
      success('Backdate request submitted');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(null);
    }
  };

  const handleApproveRequest = async (id: number) => {
    try {
      setSubmitting(id);
      const req = await businessDayService.approveBackdateRequest(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? req : r)));
      success('Backdate request approved');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to approve request');
    } finally {
      setSubmitting(null);
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectReqId || !rejectReason.trim()) {
      showError('A rejection reason is required');
      return;
    }
    try {
      setSubmitting(rejectReqId);
      const req = await businessDayService.rejectBackdateRequest(rejectReqId, rejectReason);
      setRequests((prev) => prev.map((r) => (r.id === rejectReqId ? req : r)));
      setRejectReqId(null);
      setRejectReason('');
      success('Backdate request rejected');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to reject request');
    } finally {
      setSubmitting(null);
    }
  };

  const today = new Date().toLocaleDateString();
  const todayBd = days.find(
    (d) => new Date(d.business_date).toLocaleDateString() === today
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          Business Day Management
        </h1>
        <button
          onClick={() => load()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Today's status panel */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">Today</h2>
            <p className="text-sm text-gray-500">{today}</p>
          </div>
          {todayBd ? (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BD_COLORS[todayBd.status]}`}>
              {todayBd.status === 'open' ? 'Day Open' : 'Day Closed'}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
              Not Opened
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {canManageDay && (!todayBd || todayBd.status === 'open') && (
            <button
              onClick={handleCloseDay}
              disabled={submitting === 'close'}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              {submitting === 'close' ? 'Closing…' : 'Close Business Day'}
            </button>
          )}
          {canReopen && todayBd?.status === 'closed' && (
            <button
              onClick={() => setReopenDayId(todayBd.id)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Unlock className="w-4 h-4" />
              Reopen Day
            </button>
          )}
        </div>

        {reopenDayId && (
          <div className="mt-4 border-t pt-4 space-y-2">
            <textarea
              className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Reason for reopening (required)…"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={handleReopen}
                disabled={!reopenReason.trim() || submitting !== null}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Confirm Reopen
              </button>
              <button
                onClick={() => { setReopenDayId(null); setReopenReason(''); }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Business day history */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Recent Business Days</h2>
        </div>
        <div className="divide-y">
          {days.slice(0, 10).map((d) => (
            <div key={d.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium text-gray-800 text-sm">
                  {new Date(d.business_date).toLocaleDateString()}
                </p>
                {d.closed_by_name && (
                  <p className="text-xs text-gray-500">Closed by {d.closed_by_name}</p>
                )}
                {d.override_by_name && (
                  <p className="text-xs text-blue-600">Reopened by {d.override_by_name}: {d.override_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BD_COLORS[d.status]}`}>
                  {d.status}
                </span>
                {canReopen && d.status === 'closed' && d.id !== todayBd?.id && (
                  <button
                    onClick={() => setReopenDayId(d.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
          {days.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No business day records found.</p>
          )}
        </div>
      </div>

      {/* Backdate Requests */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Backdate Requests</h2>
          {canRequestBackdate && (
            <button
              onClick={() => setShowBdForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Request
            </button>
          )}
        </div>

        {showBdForm && (
          <div className="px-5 py-4 border-b bg-blue-50 space-y-3">
            <h3 className="text-sm font-semibold text-blue-800">Submit Backdate Request</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={bdTargetDate}
                  onChange={(e) => setBdTargetDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={bdReason}
                onChange={(e) => setBdReason(e.target.value)}
                rows={2}
                placeholder="Why do you need to backdate?"
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateBackdateRequest}
                disabled={submitting !== null}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Submit
              </button>
              <button
                onClick={() => setShowBdForm(false)}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-sm border border-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y">
          {requests.map((r) => (
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">
                      {new Date(r.target_date).toLocaleDateString()}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BK_COLORS[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Requested by {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">{r.reason}</p>
                  {r.reviewed_by_name && r.status !== 'pending' && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewed_by_name}
                      {r.rejection_reason ? ` — ${r.rejection_reason}` : ''}
                    </p>
                  )}
                </div>

                {canApproveRequests && r.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproveRequest(r.id)}
                      disabled={submitting === r.id}
                      className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setRejectReqId(r.id)}
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors"
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {rejectReqId === r.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Rejection reason (required)…"
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRejectRequest}
                      disabled={!rejectReason.trim() || submitting !== null}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => { setRejectReqId(null); setRejectReason(''); }}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {requests.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No backdate requests found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessDayManagementPage;
