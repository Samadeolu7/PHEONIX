// src/pages/loans/LoanVerificationPage.tsx
/**
 * Loan NIN Verification Panel
 * Feature #12 — NIN-based Cross-Branch Verification Check
 * Feature #9  — Maker-Checker: verdict can only be set by a different user
 *
 * Route: /loans/verification/:loanId
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  loanService,
  LoanVerificationRequest,
  VerificationVerdict,
} from '../../services/loanService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowLeft,
  User,
  DollarSign,
  Activity,
} from 'lucide-react';

const VERDICT_LABELS: Record<VerificationVerdict, string> = {
  pending: 'Pending Review',
  pass: 'Pass',
  refer: 'Refer',
  decline: 'Decline',
};

const VERDICT_COLORS: Record<VerificationVerdict, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pass: 'bg-green-100 text-green-800 border-green-200',
  refer: 'bg-blue-100 text-blue-800 border-blue-200',
  decline: 'bg-red-100 text-red-800 border-red-200',
};

const LoanVerificationPage: React.FC = () => {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const { selectedRole } = useAuth();
  const { success, error: showError } = useToast();

  const [vr, setVr] = useState<LoanVerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVerdict, setSelectedVerdict] = useState<VerificationVerdict>('pending');

  const canSetVerdict = selectedRole && ['branch_manager', 'supervisor', 'director', 'admin'].includes(selectedRole);

  const loadVr = useCallback(async () => {
    if (!loanId) return;
    try {
      const list = await loanService.listVerificationRequests({ loan: Number(loanId) });
      if (list.length > 0) {
        setVr(list[0]);
        setSelectedVerdict(list[0].verdict);
      }
    } catch {
      showError('Failed to load verification request');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => { loadVr(); }, [loadVr]);

  const handleRunCheck = async () => {
    if (!vr) return;
    try {
      setRunning(true);
      const updated = await loanService.runVerificationCheck(vr.id);
      setVr(updated);
      setSelectedVerdict(updated.verdict);
      success('Verification check complete');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to run verification check');
    } finally {
      setRunning(false);
    }
  };

  const handleSetVerdict = async () => {
    if (!vr) return;
    try {
      setSubmitting(true);
      const updated = await loanService.updateVerdict(vr.id, selectedVerdict);
      setVr(updated);
      success(`Verdict set to "${VERDICT_LABELS[selectedVerdict]}"`);
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to update verdict');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!vr) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <p className="text-yellow-800">No verification request found for this loan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <ClientAvatar image={vr.client_image} name={vr.client_name} size="md" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            NIN Verification — {vr.loan_number}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{vr.client_name} — Cross-branch exposure check</p>
        </div>
        <div className="ml-auto">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${VERDICT_COLORS[vr.verdict]}`}>
            {VERDICT_LABELS[vr.verdict]}
          </span>
        </div>
      </div>

      {/* NIN Info */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 grid grid-cols-2 gap-4">
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">NIN Used</p>
            <p className="font-semibold text-gray-900 mt-0.5">{vr.nin_used || '—'}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active Loans Elsewhere</p>
            <p className="font-semibold text-gray-900 mt-0.5">{vr.active_loans_elsewhere}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Active Exposure</p>
            <p className="font-semibold text-gray-900 mt-0.5">
              {Number(vr.total_active_exposure).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Default Rate</p>
            <p className="font-semibold text-gray-900 mt-0.5">{vr.default_rate_pct}%</p>
          </div>
        </div>
      </div>

      {/* Flags */}
      {vr.flags && vr.flags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Risk Flags
          </h3>
          <ul className="space-y-1">
            {vr.flags.map((flag, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-red-700">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Amount */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-blue-700 font-medium">System Recommended Amount</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {Number(vr.recommended_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <CheckCircle className="w-10 h-10 text-blue-400" />
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Actions</h3>

        {/* Re-run check */}
        <button
          onClick={handleRunCheck}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running Check…' : 'Re-run Verification Check'}
        </button>

        {/* Verdict */}
        {canSetVerdict && (
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Set Verdict</p>
            <div className="flex gap-2 flex-wrap">
              {(['pass', 'refer', 'decline'] as VerificationVerdict[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVerdict(v)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedVerdict === v
                      ? VERDICT_COLORS[v] + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {VERDICT_LABELS[v]}
                </button>
              ))}
            </div>
            <button
              onClick={handleSetVerdict}
              disabled={submitting || selectedVerdict === 'pending'}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Confirm Verdict
            </button>
          </div>
        )}

        {!canSetVerdict && (
          <p className="text-sm text-gray-500 italic">
            Only branch managers and supervisors can set the final verdict.
          </p>
        )}
      </div>
    </div>
  );
};

export default LoanVerificationPage;
