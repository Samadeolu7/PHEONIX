// src/pages/accounting/JournalVoucherFormPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, CheckCircle, Search } from 'lucide-react';
import { CreateJournalVoucherEntry } from '../../services/journalVoucherService';
import { useTransactionSeries, useCreateJournalVoucher } from '../../hooks/useJournalVouchers';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { useToast } from '../../hooks/useToast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryRow {
  rowId: string;
  // Stage 1: a GL ledger account — either directly postable, or a
  // parent/category account (e.g. "Savings", "Loans") that requires
  // drilling into stage 2 to reach an actual postable sub-ledger.
  ledgerAccount: Account | null;
  ledgerSearch: string;
  ledgerResults: Account[];
  showLedgerDropdown: boolean;
  // Stage 2: only used when ledgerAccount is a category account — the
  // specific sub-ledger (e.g. one client's savings/loan account) to post to.
  subledgerAccount: Account | null;
  subledgerSearch: string;
  subledgerResults: Account[];
  showSubledgerDropdown: boolean;
  side: 'DR' | 'CR';
  amount: string;
}

const emptyRow = (rowId: string): EntryRow => ({
  rowId,
  ledgerAccount: null,
  ledgerSearch: '',
  ledgerResults: [],
  showLedgerDropdown: false,
  subledgerAccount: null,
  subledgerSearch: '',
  subledgerResults: [],
  showSubledgerDropdown: false,
  side: 'DR',
  amount: '',
});

// The account transactions actually post to: the ledger account itself,
// unless it's a category/parent (no direct postings allowed), in which case
// it's whichever sub-ledger was picked under it.
const resolvedAccount = (row: EntryRow): Account | null =>
  row.ledgerAccount && !row.ledgerAccount.is_category_account
    ? row.ledgerAccount
    : row.subledgerAccount;

// ─── Component ────────────────────────────────────────────────────────────────

const JournalVoucherFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const { data: seriesList = [] } = useTransactionSeries();
  const createMutation = useCreateJournalVoucher();

  // Form state
  const [formData, setFormData] = useState({
    series: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    workflow_reference: '',
  });

  const [entries, setEntries] = useState<EntryRow[]>([emptyRow('row-0'), emptyRow('row-1')]);

  // Set default series once loaded
  useEffect(() => {
    if (seriesList.length > 0 && !formData.series) {
      const jv = seriesList.find(x => x.code === 'JV');
      if (jv) setFormData(f => ({ ...f, series: String(jv.id) }));
      else setFormData(f => ({ ...f, series: String(seriesList[0].id) }));
    }
  }, [seriesList, formData.series]);

  // ─── Entries helpers ────────────────────────────────────────────────────────

  const addRow = () => {
    setEntries(rows => [...rows, emptyRow(`row-${Date.now()}`)]);
  };

  const removeRow = (rowId: string) => {
    setEntries(rows => rows.filter(r => r.rowId !== rowId));
  };

  const updateRow = (rowId: string, changes: Partial<EntryRow>) => {
    setEntries(rows => rows.map(r => (r.rowId === rowId ? { ...r, ...changes } : r)));
  };

  const searchLedger = async (rowId: string, q: string) => {
    updateRow(rowId, {
      ledgerSearch: q,
      ledgerAccount: null,
      subledgerAccount: null,
      subledgerSearch: '',
      subledgerResults: [],
      showSubledgerDropdown: false,
    });
    if (q.length < 2) {
      updateRow(rowId, { ledgerResults: [], showLedgerDropdown: false });
      return;
    }
    // include_subledgers: true so a specific loan/savings/cashier account
    // can be found by name directly here too, not only by first picking its
    // parent category — selectLedger below fills in the parent for it.
    const results = await accountService.getAccounts({
      search: q,
      is_active: true,
      include_subledgers: true,
    });
    updateRow(rowId, { ledgerResults: results.slice(0, 8), showLedgerDropdown: true });
  };

  const selectLedger = async (rowId: string, account: Account) => {
    // A sub-ledger (e.g. one cashier's till) was found directly by name in
    // stage 1 — resolve and fill in its parent category too, so the row
    // ends up looking exactly like it would if the parent had been picked
    // first and then drilled into via stage 2.
    if (account.is_entity_subledger && account.parent != null) {
      updateRow(rowId, {
        ledgerSearch: `${account.code} – ${account.name}`,
        showLedgerDropdown: false,
        ledgerResults: [],
      });
      try {
        const parent = await accountService.getAccount(String(account.parent));
        updateRow(rowId, {
          ledgerAccount: parent,
          ledgerSearch: `${parent.code} – ${parent.name}`,
          subledgerAccount: account,
          subledgerSearch: `${account.code} – ${account.name}`,
          subledgerResults: [],
          showSubledgerDropdown: false,
        });
      } catch {
        // Parent lookup failed — fall back to selecting the sub-ledger
        // account directly; it's still a valid, directly-postable account.
        updateRow(rowId, {
          ledgerAccount: account,
          subledgerAccount: null,
          subledgerSearch: '',
          subledgerResults: [],
          showSubledgerDropdown: false,
        });
      }
      return;
    }

    updateRow(rowId, {
      ledgerAccount: account,
      ledgerSearch: `${account.code} – ${account.name}`,
      showLedgerDropdown: false,
      ledgerResults: [],
      subledgerAccount: null,
      subledgerSearch: '',
      subledgerResults: [],
      showSubledgerDropdown: false,
    });
  };

  const searchSubledger = async (rowId: string, parentId: string, q: string) => {
    updateRow(rowId, { subledgerSearch: q, subledgerAccount: null });
    if (q.length < 2) {
      updateRow(rowId, { subledgerResults: [], showSubledgerDropdown: false });
      return;
    }
    const results = await accountService.getAccounts({
      search: q,
      is_active: true,
      parent: parentId,
      include_subledgers: true,
    });
    updateRow(rowId, { subledgerResults: results.slice(0, 8), showSubledgerDropdown: true });
  };

  const selectSubledger = (rowId: string, account: Account) => {
    updateRow(rowId, {
      subledgerAccount: account,
      subledgerSearch: `${account.code} – ${account.name}`,
      showSubledgerDropdown: false,
      subledgerResults: [],
    });
  };

  // ─── Totals ─────────────────────────────────────────────────────────────────

  const totalDebits = entries.reduce((sum, r) => {
    if (r.side === 'DR' && r.amount) sum += parseFloat(r.amount) || 0;
    return sum;
  }, 0);

  const totalCredits = entries.reduce((sum, r) => {
    if (r.side === 'CR' && r.amount) sum += parseFloat(r.amount) || 0;
    return sum;
  }, 0);

  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.005;

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.series) {
      showError('Please select a transaction series');
      return;
    }

    const validEntries = entries.filter(r => resolvedAccount(r) && r.amount);
    if (validEntries.length < 2) {
      showError('At least 2 entries (debit and credit) are required');
      return;
    }
    if (!isBalanced) {
      showError(`Entries must balance. Current difference: ${difference.toFixed(2)}`);
      return;
    }

    const payload: CreateJournalVoucherEntry[] = validEntries.map(r => ({
      account_id: resolvedAccount(r)!.id as unknown as number,
      side: r.side,
      amount: (parseFloat(r.amount) || 0).toFixed(2),
    }));

    try {
      const jv = await createMutation.mutateAsync({
        series: parseInt(formData.series, 10),
        date: formData.date,
        description: formData.description.trim(),
        workflow_reference: formData.workflow_reference.trim() || undefined,
        entries: payload,
      });
      success(`Journal Voucher ${jv.reference_number} created successfully`);
      navigate(`/accounting/journal-vouchers/${jv.id}`);
    } catch (err) {
      console.error(err);
      showError('Failed to create journal voucher');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/accounting/journal-vouchers')}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">New Journal Voucher</h1>
              <p className="text-xs text-gray-500">Create a manual GL journal entry</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isBalanced && entries.filter(r => resolvedAccount(r) && r.amount).length >= 2 && (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle size={15} /> Balanced
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Header fields */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
            Voucher Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Series */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction Series <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.series}
                onChange={e => setFormData(f => ({ ...f, series: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select series…</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} – {s.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voucher Date <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={formData.date}
                onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description / Narration <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Accrual of electricity expense for March 2026"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Workflow reference */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference / Source Doc <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV-0001, PO-00042"
                value={formData.workflow_reference}
                onChange={e => setFormData(f => ({ ...f, workflow_reference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Journal Entry Lines */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Journal Entry Lines
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 transition-colors font-medium"
            >
              <Plus size={13} /> Add Line
            </button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-5">Account</div>
            <div className="col-span-2 text-center">Dr / Cr</div>
            <div className="col-span-3 text-right">Amount</div>
            <div className="col-span-2" />
          </div>

          {/* Entry rows */}
          <div className="divide-y divide-gray-50">
            {entries.map((row, idx) => (
              <div key={row.rowId} className="grid grid-cols-12 gap-2 px-4 py-2 items-start">
                {/* Account search: stage 1 (ledger) + stage 2 (sub-ledger) */}
                <div className="col-span-5 relative space-y-1">
                  {/* Stage 1: Ledger */}
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search ledger account…"
                      value={row.ledgerSearch}
                      onChange={e => searchLedger(row.rowId, e.target.value)}
                      onBlur={() =>
                        setTimeout(() => updateRow(row.rowId, { showLedgerDropdown: false }), 200)
                      }
                      className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {row.showLedgerDropdown && row.ledgerResults.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {row.ledgerResults.map(acc => (
                          <button
                            key={acc.id}
                            type="button"
                            onMouseDown={() => selectLedger(row.rowId, acc)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                          >
                            <span className="font-mono text-gray-500">{acc.code}</span>
                            <span className="text-gray-700">{acc.name}</span>
                            {acc.is_category_account && (
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                Ledger
                              </span>
                            )}
                            {acc.is_entity_subledger && (
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                Sub-ledger
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stage 2: Sub-ledger — only when the ledger picked is a category (e.g. Savings, Loans) */}
                  {row.ledgerAccount?.is_category_account && (
                    <div className="relative pl-3 border-l-2 border-blue-100">
                      <Search
                        size={13}
                        className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        placeholder={`Search ${row.ledgerAccount.name} sub-ledger…`}
                        value={row.subledgerSearch}
                        onChange={e =>
                          searchSubledger(row.rowId, row.ledgerAccount!.id, e.target.value)
                        }
                        onBlur={() =>
                          setTimeout(
                            () => updateRow(row.rowId, { showSubledgerDropdown: false }),
                            200
                          )
                        }
                        className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {row.showSubledgerDropdown && row.subledgerResults.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {row.subledgerResults.map(acc => (
                            <button
                              key={acc.id}
                              type="button"
                              onMouseDown={() => selectSubledger(row.rowId, acc)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                            >
                              <span className="font-mono text-gray-500">{acc.code}</span>
                              <span className="text-gray-700">{acc.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {resolvedAccount(row) && (
                    <span className="block text-xs text-green-600 pl-1">
                      ✓ {resolvedAccount(row)!.code} – {resolvedAccount(row)!.name}
                    </span>
                  )}
                  {row.ledgerAccount?.is_category_account && !row.subledgerAccount && (
                    <span className="block text-xs text-amber-600 pl-1">
                      Select a sub-ledger account to continue
                    </span>
                  )}
                </div>

                {/* Dr / Cr */}
                <div className="col-span-2 flex justify-center gap-1 pt-0.5">
                  {(['DR', 'CR'] as const).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => updateRow(row.rowId, { side })}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        row.side === side
                          ? side === 'DR'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div className="col-span-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={row.amount}
                    onChange={e => updateRow(row.rowId, { amount: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Remove */}
                <div className="col-span-2 flex justify-end pt-0.5">
                  {entries.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowId)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={`Remove line ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Totals
              </div>
              <div className="col-span-2" />
              <div className="col-span-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-blue-600 font-medium">Total DR:</span>
                  <span className="font-mono font-semibold">
                    {totalDebits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-600 font-medium">Total CR:</span>
                  <span className="font-mono font-semibold">
                    {totalCredits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {!isBalanced && (totalDebits > 0 || totalCredits > 0) && (
                  <div className="flex justify-between text-xs text-red-600 font-semibold pt-1 border-t border-red-200">
                    <span>Difference:</span>
                    <span className="font-mono">
                      {difference.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {isBalanced && (totalDebits > 0 || totalCredits > 0) && (
                  <div className="flex justify-between text-xs text-green-600 font-semibold pt-1 border-t border-green-200">
                    <span>✓ Balanced</span>
                  </div>
                )}
              </div>
              <div className="col-span-2" />
            </div>
          </div>
        </div>

        {/* Validation warning */}
        {!isBalanced && (totalDebits > 0 || totalCredits > 0) && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Journal entries must balance (DR = CR). Current difference:{' '}
              <strong>{difference.toFixed(2)}</strong>
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate('/accounting/journal-vouchers')}
            className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              createMutation.isPending ||
              !isBalanced ||
              entries.filter(r => resolvedAccount(r) && r.amount).length < 2
            }
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Saving…' : 'Save Journal Voucher'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default JournalVoucherFormPage;
