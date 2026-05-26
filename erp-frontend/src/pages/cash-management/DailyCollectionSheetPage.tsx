/**
 * Daily Collection Sheet Page
 *
 * Lets a credit officer manage their daily collection worksheet and lets
 * a supervisor / BM reconcile it.
 *
 * Feature #8  — CO payment mode is restricted to Cash + Bank Transfer.
 *               Mobile Money option is hidden for credit_officer role.
 *
 * Feature #13 — Before calling reconcile(), a confirmation modal shows
 *               the total cash amount that will be swept to the branch
 *               bank GL account.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  collectionSheetService,
  DailyCollectionSheetDetail,
  CollectionSheetItem,
  PaymentMode,
  CollectItemPayload,
} from '../../services/collectionSheetService';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLOR: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-700',
  active:     'bg-blue-100 text-blue-700',
  submitted:  'bg-yellow-100 text-yellow-700',
  reconciled: 'bg-green-100 text-green-700',
};

// ── Collect Item Modal ───────────────────────────────────────────────────────

interface CollectModalProps {
  item: CollectionSheetItem;
  isCreditOfficer: boolean;
  onClose: () => void;
  onSave: (itemId: number, payload: CollectItemPayload) => Promise<void>;
}

const CollectModal: React.FC<CollectModalProps> = ({ item, isCreditOfficer, onClose, onSave }) => {
  const [amount, setAmount] = useState(item.amount_collected !== '0.00' ? item.amount_collected : item.amount_expected);
  const [mode, setMode] = useState<PaymentMode>(item.payment_mode);
  const [bankRef, setBankRef] = useState(item.bank_reference || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Feature #8: CO only sees Cash + Bank Transfer.
   * Mobile Money is hidden for credit_officer role.
   */
  const paymentModeOptions: { value: PaymentMode; label: string }[] = isCreditOfficer
    ? [
        { value: 'cash',          label: 'Cash' },
        { value: 'bank_transfer', label: 'Direct Bank Transfer' },
      ]
    : [
        { value: 'cash',          label: 'Cash' },
        { value: 'bank_transfer', label: 'Direct Bank Transfer' },
        { value: 'mobile_money',  label: 'Mobile Money / USSD' },
      ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      const payload: CollectItemPayload = {
        amount_collected: amount,
        payment_mode: mode,
        bank_reference: bankRef,
        notes,
      };
      await onSave(item.id, payload);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Record Collection</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-500">Client</p>
            <p className="font-medium">{item.client_name ?? `Client #${item.client}`}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Type</p>
            <p className="font-medium">{item.collection_type_display}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Expected Amount (₦)</p>
            <p className="font-medium text-gray-800">₦{fmt(item.amount_expected)}</p>
          </div>
          <div>
            <label htmlFor="collect-amount" className="block text-sm text-gray-600 mb-1">Amount Collected (₦) <span className="text-red-500">*</span></label>
            <input
              id="collect-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            {/* Feature #8: CO sees only Cash + Bank Transfer */}
            <label htmlFor="collect-mode" className="block text-sm text-gray-600 mb-1">Payment Mode <span className="text-red-500">*</span></label>
            <select
              id="collect-mode"
              value={mode}
              onChange={e => setMode(e.target.value as PaymentMode)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {paymentModeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {isCreditOfficer && (
              <p className="text-xs text-gray-400 mt-1">Mobile money payments must be processed by a supervisor.</p>
            )}
          </div>
          {mode === 'bank_transfer' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bank Reference / Teller No.</label>
              <input
                type="text"
                maxLength={100}
                value={bankRef}
                onChange={e => setBankRef(e.target.value)}
                placeholder="e.g. TLR-20250521-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label htmlFor="collect-notes" className="block text-sm text-gray-600 mb-1">Notes</label>
            <textarea
              id="collect-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertTriangle size={14} />{error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Reconcile Confirm Modal ──────────────────────────────────────────────────

/**
 * Feature #13: Show the cash amount that will be swept to the branch bank
 * GL account before confirming the reconcile action.
 */
interface ReconcileModalProps {
  sheet: DailyCollectionSheetDetail;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ReconcileModal: React.FC<ReconcileModalProps> = ({ sheet, onClose, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashAmount = parseFloat(sheet.total_collected_cash ?? '0');
  const transferAmount = parseFloat(sheet.total_confirmed_transfers ?? '0');
  const totalConfirmed = cashAmount + transferAmount;
  const pendingTransfers = parseFloat(sheet.total_unconfirmed_transfers ?? '0');

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Reconciliation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600" />
            Confirm Reconciliation
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            You are about to reconcile the collection sheet for{' '}
            <strong>{sheet.credit_officer_name}</strong> dated{' '}
            <strong>{sheet.collection_date}</strong>.
          </p>

          {/* GL Sweep Summary — Feature #13 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-800">GL Journal Entry Preview</p>
            {cashAmount > 0 ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Cash collected (till → branch bank):</span>
                  <span className="font-medium text-blue-700">₦{fmt(cashAmount)}</span>
                </div>
                <p className="text-xs text-gray-500 italic">
                  A debit will be posted to the Branch Bank GL account and a credit to the
                  officer's till account for this amount.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">No cash collected — no GL sweep required.</p>
            )}
            {transferAmount > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Confirmed bank transfers (already posted):</span>
                <span className="font-medium">₦{fmt(transferAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-1">
              <span>Total confirmed collections:</span>
              <span className="text-green-700">₦{fmt(totalConfirmed)}</span>
            </div>
          </div>

          {pendingTransfers > 0 && (
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>₦{fmt(pendingTransfers)}</strong> of unconfirmed bank transfers remain on this
                sheet. You cannot reconcile until all transfers are confirmed or rejected.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertTriangle size={14} />{error}
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || pendingTransfers > 0}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Confirm Reconciliation
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Submit Sheet Modal ───────────────────────────────────────────────────────

interface SubmitModalProps {
  onClose: () => void;
  onSubmit: (submittedTo: number, notes: string) => Promise<void>;
}

const SubmitModal: React.FC<SubmitModalProps> = ({ onClose, onSubmit }) => {
  const [staffList, setStaffList] = useState<{ id: number; name: string }[]>([]);
  const [submittedTo, setSubmittedTo] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token') ?? localStorage.getItem('token');
    fetch('/api/hr/staff/?is_active=true&page_size=200', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.results ?? []);
        setStaffList(list.map((s: any) => ({
          id: s.id,
          name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.user_email || `Staff #${s.id}`,
        })));
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submittedTo) { setError('Select a superior to submit to.'); return; }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(Number(submittedTo), notes);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Submit failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Submit Collection Sheet</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="submit-to" className="block text-sm text-gray-600 mb-1">Submit To (Superior) <span className="text-red-500">*</span></label>
            <select
              id="submit-to"
              value={submittedTo}
              onChange={e => setSubmittedTo(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Superior —</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="submit-notes" className="block text-sm text-gray-600 mb-1">Notes</label>
            <textarea
              id="submit-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertTriangle size={14} />{error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Submit Sheet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const DailyCollectionSheetPage: React.FC = () => {
  const { sheetId } = useParams<{ sheetId?: string }>();
  const navigate = useNavigate();
  const { selectedRole } = useAuth();

  const isCreditOfficer = selectedRole === 'credit_officer';
  const isBmPlus = ['branch_manager', 'supervisor', 'director', 'admin', 'operations'].includes(selectedRole ?? '');

  // ── List view state ────────────────────────────────────────────────────────
  const [sheets, setSheets] = useState<any[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  // ── Detail view state ──────────────────────────────────────────────────────
  const [sheet, setSheet] = useState<DailyCollectionSheetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [collectingItem, setCollectingItem] = useState<CollectionSheetItem | null>(null);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadSheet = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await collectionSheetService.retrieve(id);
      setSheet(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to load collection sheet.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSheets = useCallback(async () => {
    setSheetsLoading(true);
    try {
      const data = await collectionSheetService.list();
      setSheets(data);
    } catch {
      // ignore
    } finally {
      setSheetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sheetId) {
      loadSheet(Number(sheetId));
    } else {
      loadSheets();
    }
  }, [sheetId, loadSheet, loadSheets]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function showMsg(type: 'success' | 'error', text: string) {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  }

  async function handleActivate() {
    if (!sheet) return;
    try {
      await collectionSheetService.activate(sheet.id);
      await loadSheet(sheet.id);
      showMsg('success', 'Sheet activated — you can now start collecting.');
    } catch (err: any) {
      showMsg('error', err?.response?.data?.error ?? 'Could not activate sheet.');
    }
  }

  async function handleGenerate() {
    if (!sheet) return;
    try {
      const res = await collectionSheetService.generateFromSchedule(sheet.id);
      await loadSheet(sheet.id);
      showMsg('success', res.message);
    } catch (err: any) {
      showMsg('error', err?.response?.data?.error ?? 'Failed to generate items.');
    }
  }

  async function handleCollectSave(itemId: number, payload: CollectItemPayload) {
    await collectionSheetService.collectItem(itemId, payload);
    if (sheet) await loadSheet(sheet.id);
  }

  async function handlePostPayment(item: CollectionSheetItem) {
    try {
      await collectionSheetService.postPayment(item.id);
      if (sheet) await loadSheet(sheet.id);
      showMsg('success', 'Payment posted to GL.');
    } catch (err: any) {
      showMsg('error', err?.response?.data?.error ?? 'GL post failed.');
    }
  }

  async function handleSubmitSheet(submittedTo: number, notes: string) {
    if (!sheet) return;
    await collectionSheetService.submit(sheet.id, { submitted_to: submittedTo, notes });
    await loadSheet(sheet.id);
    showMsg('success', 'Sheet submitted successfully.');
  }

  async function handleReconcile() {
    if (!sheet) return;
    await collectionSheetService.reconcile(sheet.id);
    await loadSheet(sheet.id);
    showMsg('success', 'Sheet reconciled — GL journal entry created.');
  }

  async function handleConfirmTransfer(item: CollectionSheetItem) {
    try {
      await collectionSheetService.confirmTransfer(item.id);
      if (sheet) await loadSheet(sheet.id);
      showMsg('success', 'Bank transfer confirmed and posted.');
    } catch (err: any) {
      showMsg('error', err?.response?.data?.error ?? 'Confirmation failed.');
    }
  }

  async function handleRejectTransfer(item: CollectionSheetItem) {
    const reason = window.prompt('Reason for rejection (optional):') ?? '';
    try {
      await collectionSheetService.rejectTransfer(item.id, reason);
      if (sheet) await loadSheet(sheet.id);
      showMsg('success', 'Bank transfer rejected.');
    } catch (err: any) {
      showMsg('error', err?.response?.data?.error ?? 'Rejection failed.');
    }
  }

  // ── Render: list view ──────────────────────────────────────────────────────
  if (!sheetId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <FileText size={22} /> Daily Collection Sheets
        </h1>
        {sheetsLoading ? (
          <div className="flex items-center gap-2 text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : sheets.length === 0 ? (
          <p className="text-gray-500">No collection sheets found.</p>
        ) : (
          <div className="space-y-3">
            {sheets.map(s => (
              <div
                key={s.id}
                onClick={() => navigate(`/cash-management/collection-sheets/${s.id}`)}
                className="border border-gray-200 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-800">{s.collection_date}</p>
                  <p className="text-sm text-gray-500">{s.credit_officer_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    ₦{fmt(s.total_collected_cash)} cash / {s.total_items} items
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {s.status_display}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: loading/error ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 size={18} className="animate-spin" /> Loading sheet…
      </div>
    );
  }
  if (error || !sheet) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} />{error ?? 'Sheet not found.'}
        </div>
      </div>
    );
  }

  const canActivate   = sheet.status === 'draft';
  const canGenerate   = sheet.status === 'active';
  const canCollect    = sheet.status === 'active' && isCreditOfficer;
  const canSubmit     = sheet.status === 'active' && isCreditOfficer;
  const canReconcile  = sheet.status === 'submitted' && isBmPlus;

  // ── Render: detail view ────────────────────────────────────────────────────
  return (
    <>
      {/* Collect modal */}
      {collectingItem && (
        <CollectModal
          item={collectingItem}
          isCreditOfficer={isCreditOfficer}
          onClose={() => setCollectingItem(null)}
          onSave={handleCollectSave}
        />
      )}

      {/* Feature #13 — Reconcile confirmation modal */}
      {showReconcileModal && (
        <ReconcileModal
          sheet={sheet}
          onClose={() => setShowReconcileModal(false)}
          onConfirm={handleReconcile}
        />
      )}

      {/* Submit modal */}
      {showSubmitModal && (
        <SubmitModal
          onClose={() => setShowSubmitModal(false)}
          onSubmit={handleSubmitSheet}
        />
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <button
              onClick={() => navigate('/cash-management/collection-sheets')}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2"
            >
              <ChevronLeft size={14} /> All Sheets
            </button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileText size={22} />
              Collection Sheet — {sheet.collection_date}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{sheet.credit_officer_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${STATUS_COLOR[sheet.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {sheet.status_display}
            </span>
            <button
              onClick={() => loadSheet(sheet.id)}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Action feedback banner */}
        {actionMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            actionMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {actionMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            {actionMsg.text}
          </div>
        )}

        {/* Totals summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Expected', value: sheet.total_expected, color: 'text-gray-800' },
            { label: 'Cash Collected', value: sheet.total_collected_cash, color: 'text-blue-700' },
            { label: 'Confirmed Transfers', value: sheet.total_confirmed_transfers, color: 'text-green-700' },
            { label: 'Pending Transfers', value: sheet.total_unconfirmed_transfers, color: 'text-yellow-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold mt-1 ${color}`}>₦{fmt(value)}</p>
            </div>
          ))}
        </div>

        {/* Workflow action buttons */}
        <div className="flex gap-3 flex-wrap">
          {canActivate && (
            <button
              onClick={handleActivate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Activate Sheet
            </button>
          )}
          {canGenerate && (
            <button
              onClick={handleGenerate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Generate from Schedule
            </button>
          )}
          {canSubmit && (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 flex items-center gap-1.5"
            >
              <Send size={14} /> Submit Sheet
            </button>
          )}
          {/* Feature #13: Reconcile opens confirmation modal, not direct API call */}
          {canReconcile && (
            <button
              onClick={() => setShowReconcileModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
            >
              <CheckCircle size={14} /> Reconcile Sheet
            </button>
          )}
        </div>

        {/* Notes */}
        {sheet.notes && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
            <p className="font-medium text-xs text-gray-400 uppercase mb-1">Notes</p>
            {sheet.notes}
          </div>
        )}

        {/* Collection Items Table */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <DollarSign size={16} /> Collection Items ({sheet.items?.length ?? 0})
          </h2>
          {!sheet.items || sheet.items.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center border border-dashed border-gray-300 rounded-xl">
              No items yet. {canGenerate && 'Use "Generate from Schedule" to auto-populate.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Client</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Expected</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Collected</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Mode</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Posted</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sheet.items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {item.client_name ?? `#${item.client}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.collection_type_display}</td>
                      <td className="px-4 py-3 text-gray-700">₦{fmt(item.amount_expected)}</td>
                      <td className="px-4 py-3 font-medium text-blue-700">₦{fmt(item.amount_collected)}</td>
                      <td className="px-4 py-3 text-gray-600">{item.payment_mode_display}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.status === 'collected' ? 'bg-green-100 text-green-700' :
                          item.status === 'waived'    ? 'bg-purple-100 text-purple-700' :
                          item.status === 'skipped'   ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {item.status_display}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.is_posted
                          ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} /> Posted</span>
                          : <span className="text-xs text-gray-400">No</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {canCollect && !item.is_posted && (
                            <button
                              onClick={() => setCollectingItem(item)}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Collect
                            </button>
                          )}
                          {canCollect && item.status === 'collected' && item.payment_mode === 'cash' && !item.is_posted && (
                            <button
                              onClick={() => handlePostPayment(item)}
                              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                            >
                              Post GL
                            </button>
                          )}
                          {isBmPlus && item.transfer_confirmation_status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleConfirmTransfer(item)}
                                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => handleRejectTransfer(item)}
                                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {item.transfer_confirmation_status === 'pending' && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <Clock size={11} /> Awaiting
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DailyCollectionSheetPage;
