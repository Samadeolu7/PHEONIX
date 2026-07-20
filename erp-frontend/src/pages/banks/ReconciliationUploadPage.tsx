import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Upload, FileText, X } from 'lucide-react';
import { useBankAccounts } from '../../hooks/useBanks';
import { reconciliationService } from '../../services/reconciliationService';
import { useToast } from '../../hooks/useToast';

const ACCEPTED_EXTENSIONS = ['.csv', '.txt', '.xlsx', '.qif'];

const ReconciliationUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { error: showError, success: showSuccess, info: showInfo } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React Query hook for bank accounts (active, not suspended)
  const { data: allAccounts = [], isLoading: loadingAccounts } = useBankAccounts();
  const accounts = allAccounts.filter(a => a.is_active && !a.is_suspended);

  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [includeDebits, setIncludeDebits] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const ext = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      showError(`Unsupported file type "${ext}". Use CSV, Excel (.xlsx), or QIF.`);
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!bankAccountId) {
      setFormError('Please select a bank account.');
      return;
    }
    if (!file) {
      setFormError('Please choose a statement file to upload.');
      return;
    }

    setSubmitting(true);
    try {
      // The dates reconciled are whatever value dates are actually in the
      // file — one DailyReconciliation gets created per distinct date, each
      // matched in the background (see banks/tasks.py). A date that already
      // has a reconciliation is re-matched (not skipped) — a day is never
      // really "closed," postings lag. This request returns almost
      // immediately with each one at status='processing'.
      const result = await reconciliationService.uploadStatement({
        bank_account_id: bankAccountId,
        statement_file: file,
        include_debits: includeDebits,
      });

      if (result.skipped_dates.length > 0) {
        showInfo(
          `${result.skipped_dates.length} date(s) are currently being reconciled and were left alone — try again shortly: ${result.skipped_dates.join(', ')}`
        );
      }

      const all = [...result.reconciliations, ...result.reconciliations_rerun];
      if (all.length === 1) {
        navigate(`/banks/reconciliations/${all[0].id}`);
      } else {
        const parts = [];
        if (result.reconciliations.length > 0) parts.push(`${result.reconciliations.length} new`);
        if (result.reconciliations_rerun.length > 0) parts.push(`${result.reconciliations_rerun.length} re-matched`);
        showSuccess(`${parts.join(', ')} reconciliation(s) from this statement.`);
        navigate('/banks/reconciliations');
      }
    } catch (err: any) {
      setSubmitting(false);
      setFormError(err.message || 'Failed to reconcile statement. Please try again.');
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/banks/reconciliations')}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Statement Reconciliation</h1>
          <p className="text-gray-600 mt-1">
            Upload a bank statement to automatically match transactions against ERP records
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {formError}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingAccounts}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="">
              {loadingAccounts ? 'Loading accounts…' : 'Select a bank account'}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name} — {account.account_number}
                {account.bank_name ? ` (${account.bank_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Statement File</label>
          {!file ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 mb-1">CSV, Excel (.xlsx), or QIF</p>
              <p className="text-xs text-gray-400 mb-4">Exported directly from your bank</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Choose File
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                <span className="text-sm text-gray-900 truncate">{file.name}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            The date(s) reconciled are whatever value dates are in the file — a multi-day
            statement creates one reconciliation per day automatically.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeDebits}
            onChange={(e) => setIncludeDebits(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            Also reconcile debits (withdrawals, disbursements, bank charges) — off by default,
            since most reconciliations only need to confirm incoming payments
          </span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/banks/reconciliations')}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Uploading…' : 'Upload & Reconcile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReconciliationUploadPage;
