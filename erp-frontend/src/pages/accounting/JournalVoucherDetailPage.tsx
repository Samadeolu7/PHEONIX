// src/pages/accounting/JournalVoucherDetailPage.tsx
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  RotateCcw,
  FileText,
  Calendar,
  User,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Info,
} from 'lucide-react';
import { JournalVoucher } from '../../services/journalVoucherService';
import { useJournalVoucher, useApproveJournalVoucher } from '../../hooks/useJournalVouchers';
import { journalVoucherService } from '../../services/journalVoucherService';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  description: string;
  requireReason?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  loading: boolean;
  confirmLabel?: string;
  confirmClass?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  description,
  requireReason,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = 'Confirm',
  confirmClass = 'bg-blue-600 hover:bg-blue-700',
}) => {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        {requireReason && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a detailed reason (min 10 characters)…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading || (requireReason ? reason.trim().length < 10 : false)}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${confirmClass}`}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const JournalVoucherDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [modal, setModal] = useState<'approve' | 'reverse' | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);

  const jvId = Number(id);
  const { data: jv, isLoading: loading } = useJournalVoucher(jvId, !!id);
  const approveMutation = useApproveJournalVoucher();

  const handleApprove = async () => {
    if (!jv) return;
    try {
      await approveMutation.mutateAsync(jv.id);
      success(`Journal Voucher ${jv.reference_number} posted successfully`);
      setModal(null);
    } catch (err) {
      console.error(err);
      showError('Failed to post journal voucher');
    }
  };

  const handleReverse = async (reason?: string) => {
    if (!jv || !reason) return;
    try {
      setReverseLoading(true);
      await journalVoucherService.reverseJournalVoucher(jv.id, reason);
      success(`Journal Voucher ${jv.reference_number} reversed successfully`);
      setModal(null);
    } catch (err) {
      console.error(err);
      showError('Failed to reverse journal voucher');
    } finally {
      setReverseLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!jv) return null;

  const totalDebits = Number(jv.total_debits);
  const totalCredits = Number(jv.total_credits);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/accounting/journal-vouchers')}
                className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="font-mono text-blue-600">{jv.reference_number}</span>
                  {jv.is_reversed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <RotateCcw size={10} /> Reversed
                    </span>
                  )}
                  {jv.is_reversal && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      <RotateCcw size={10} /> Reversal
                    </span>
                  )}
                  {jv.approved && !jv.is_reversed && !jv.is_reversal && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle size={10} /> Posted
                    </span>
                  )}
                  {!jv.approved && !jv.is_reversed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      <XCircle size={10} /> Pending
                    </span>
                  )}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">Journal Voucher</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {canUserApprove && !jv.approved && !jv.is_reversed && (
                <button
                  onClick={() => setModal('approve')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <CheckCircle size={15} /> Post / Approve
                </button>
              )}
              {jv.approved && !jv.is_reversed && !jv.is_reversal && (
                <button
                  onClick={() => setModal('reverse')}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <RotateCcw size={15} /> Reverse
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Reversal notice */}
        {jv.is_reversed && jv.reversal_transaction_ref && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <p className="font-medium">This voucher has been reversed</p>
              <p className="mt-0.5">
                Reversed by <span className="font-mono">{jv.reversal_transaction_ref}</span>
                {jv.reversal_reason && ` — ${jv.reversal_reason}`}
              </p>
            </div>
          </div>
        )}

        {jv.is_reversal && jv.reverses_transaction_ref && (
          <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
            <Info size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-orange-700">
              <p className="font-medium">This is a reversing entry</p>
              <p className="mt-0.5">
                Reverses{' '}
                <button
                  onClick={() =>
                    navigate(`/accounting/journal-vouchers?search=${jv.reverses_transaction_ref}`)
                  }
                  className="font-mono underline hover:no-underline"
                >
                  {jv.reverses_transaction_ref}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Voucher meta */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
            Voucher Information
          </h2>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Series</dt>
              <dd className="font-medium font-mono">
                {jv.series.code}
                <span className="font-sans font-normal text-gray-500 ml-1">
                  – {jv.series.description}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Date</dt>
              <dd className="font-medium flex items-center gap-1">
                <Calendar size={13} className="text-gray-400" />
                {new Date(jv.date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Balanced</dt>
              <dd>
                {jv.is_balanced ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle size={13} /> Yes
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-1">
                    <XCircle size={13} /> No
                  </span>
                )}
              </dd>
            </div>
            <div className="col-span-2 md:col-span-3">
              <dt className="text-gray-500 text-xs mb-0.5">Description / Narration</dt>
              <dd className="font-medium">{jv.description}</dd>
            </div>
            {jv.workflow_reference && (
              <div>
                <dt className="text-gray-500 text-xs mb-0.5">Source Reference</dt>
                <dd className="font-mono text-blue-600">{jv.workflow_reference}</dd>
              </div>
            )}
            {jv.approved && (
              <>
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Posted By</dt>
                  <dd className="flex items-center gap-1">
                    <User size={13} className="text-gray-400" />
                    {jv.approved_by_name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs mb-0.5">Posted At</dt>
                  <dd>{jv.approved_at ? new Date(jv.approved_at).toLocaleString('en-GB') : '—'}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {/* Entry lines */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Journal Entry Lines
            </h2>
            <span className="text-xs text-gray-400">{jv.entries.length} lines</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Account</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600 text-xs">
                  Dr / Cr
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">Debit</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jv.entries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => navigate(`/accounts/${entry.account.id}/ledger`)}
                      className="flex items-center gap-1.5 text-left hover:text-blue-600 transition-colors group"
                    >
                      <span className="font-mono text-xs text-gray-500 group-hover:text-blue-500">
                        {entry.account.code}
                      </span>
                      <span className="text-gray-700 group-hover:text-blue-600">
                        {entry.account.name}
                      </span>
                      <ExternalLink
                        size={11}
                        className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity"
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        entry.side === 'DR'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {entry.side}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                    {entry.side === 'DR'
                      ? Number(entry.amount).toLocaleString('en-NG', {
                          minimumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                    {entry.side === 'CR'
                      ? Number(entry.amount).toLocaleString('en-NG', {
                          minimumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                >
                  Totals
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                  {totalDebits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                  {totalCredits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-xs text-gray-400 flex gap-6">
          <span>Created: {new Date(jv.created_at).toLocaleString('en-GB')}</span>
          <span>Updated: {new Date(jv.updated_at).toLocaleString('en-GB')}</span>
          <span>ID: #{jv.id}</span>
        </div>
      </div>

      {/* Modals */}
      {modal === 'approve' && (
        <ConfirmModal
          title="Post Journal Voucher"
          description={`Post ${jv.reference_number}? This will apply the journal entries to the general ledger. You can reverse it later if needed.`}
          onConfirm={handleApprove}
          onCancel={() => setModal(null)}
          loading={approveMutation.isPending}
          confirmLabel="Post Voucher"
          confirmClass="bg-green-600 hover:bg-green-700"
        />
      )}

      {modal === 'reverse' && (
        <ConfirmModal
          title="Reverse Journal Voucher"
          description={`This will create a reversing entry for ${jv.reference_number} with opposite DR/CR sides. This action creates a new journal entry; the original is not modified.`}
          requireReason
          onConfirm={handleReverse}
          onCancel={() => setModal(null)}
          loading={reverseLoading}
          confirmLabel="Reverse Voucher"
          confirmClass="bg-red-600 hover:bg-red-700"
        />
      )}
    </div>
  );
};

export default JournalVoucherDetailPage;
