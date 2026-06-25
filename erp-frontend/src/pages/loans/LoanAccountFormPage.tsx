/**
 * New Loan Application Page
 * Creates a new loan account (application) for a client.
 * After submission the loan enters 'pending' status awaiting verification and approval.
 *
 * Fee panel: when a product and amount are set, the fee preview is fetched and
 * shown so staff can review charges before submitting. Fees configured as
 * 'user_choice' expose a destination selector (cashier vs savings account).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark, Loader2, AlertCircle, CheckCircle, ArrowLeft,
  Info, CreditCard, Wallet,
} from 'lucide-react';
import {
  loanService, LoanProduct, CreateLoanAccountData,
  LoanAccount, FeePreviewItem, FeeRouting, TermUnit,
} from '../../services/loanService';
import { clientService, Client } from '../../services/clientService';
import { getSavingsAccounts, SavingsAccount } from '../../services/savingsService';

const REPAYMENT_FREQS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TRIGGER_LABEL: Record<string, string> = {
  registration: 'At Registration',
  approval:     'At Approval',
  disbursement: 'At Disbursement',
};

export default function LoanAccountFormPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSavings, setClientSavings] = useState<SavingsAccount[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingSavings, setLoadingSavings] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null);
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [termUnit, setTermUnit] = useState<TermUnit>('months');
  const [repaymentFreq, setRepaymentFreq] = useState('monthly');
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState('');

  const [feePreviews, setFeePreviews] = useState<FeePreviewItem[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [feeRouting, setFeeRouting] = useState<Record<number, { destination: 'cashier' | 'savings'; savings_account_id: number | null }>>({});
  const feeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optional cashier account override. The backend auto-resolves from the teller
  // session but staff can specify a different account if needed.
  const [cashierAccountId, setCashierAccountId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try { const data = await loanService.listProducts({ is_active: true }); setProducts(data); }
    catch { /* ignore */ }
    finally { setLoadingProducts(false); }
  }, []);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const response = await clientService.getClients({ status: 'active' });
      const list = response?.results ?? response?.data ?? response ?? [];
      setClients(Array.isArray(list) ? list : []);
    } catch { setClients([]); }
    finally { setLoadingClients(false); }
  }, []);

  useEffect(() => { loadProducts(); loadClients(); }, [loadProducts, loadClients]);

  useEffect(() => {
    if (!clientId) { setClientSavings([]); return; }
    setLoadingSavings(true);
    getSavingsAccounts({ client: parseInt(clientId) })
      .then(data => {
        const list = Array.isArray(data) ? data : (data as { results?: SavingsAccount[] }).results ?? [];
        setClientSavings(list.filter(s => s.status === 'active'));
      })
      .catch(() => setClientSavings([]))
      .finally(() => setLoadingSavings(false));
  }, [clientId]);

  useEffect(() => {
    if (feeDebounceRef.current) clearTimeout(feeDebounceRef.current);
    const pid = parseInt(productId);
    const amt = parseFloat(requestedAmount);
    if (!pid || isNaN(pid) || !amt || amt <= 0) { setFeePreviews([]); return; }
    feeDebounceRef.current = setTimeout(async () => {
      setLoadingFees(true);
      try {
        const previews = await loanService.previewFees(pid, amt);
        setFeePreviews(previews);
        setFeeRouting(prev => {
          const next = { ...prev };
          previews.forEach(fee => {
            if (fee.debit_destination === 'user_choice' && !(fee.id in next))
              next[fee.id] = { destination: 'cashier', savings_account_id: null };
          });
          return next;
        });
      } catch { setFeePreviews([]); }
      finally { setLoadingFees(false); }
    }, 600);
  }, [productId, requestedAmount]);

  function handleProductChange(id: string) {
    setProductId(id);
    const p = products.find(x => String(x.id) === id) ?? null;
    setSelectedProduct(p);
    if (p) {
      if (!requestedAmount) setRequestedAmount(p.min_loan_amount);
      if (!termMonths) setTermMonths(String(p.min_term_months));
      setTermUnit(p.term_unit ?? 'months');
      if (p.allowed_repayment_frequencies?.length) setRepaymentFreq(p.allowed_repayment_frequencies[0]);
    }
  }

  function handleRoutingDestination(feeId: number, dest: 'cashier' | 'savings') {
    setFeeRouting(prev => ({
      ...prev,
      [feeId]: { ...prev[feeId], destination: dest, savings_account_id: dest === 'cashier' ? null : (prev[feeId]?.savings_account_id ?? null) },
    }));
  }

  function handleRoutingSavingsAccount(feeId: number, savingsId: number | null) {
    setFeeRouting(prev => ({ ...prev, [feeId]: { ...prev[feeId], savings_account_id: savingsId } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    const cId = parseInt(clientId);
    const pId = parseInt(productId);
    const amount = parseFloat(requestedAmount);
    const termVal = parseInt(termMonths);
    const unitLabel = termUnit === 'days' ? 'days' : termUnit === 'weeks' ? 'weeks' : 'months';
    if (!cId || isNaN(cId))       { setError('Please select a valid client.'); return; }
    if (!pId || isNaN(pId))       { setError('Please select a loan product.'); return; }
    if (!amount || amount <= 0)   { setError('Requested amount must be greater than zero.'); return; }
    if (!termVal || termVal <= 0) { setError(`Term must be at least 1 ${unitLabel}.`); return; }
    if (selectedProduct) {
      const min = parseFloat(selectedProduct.min_loan_amount);
      const max = parseFloat(selectedProduct.max_loan_amount);
      if (amount < min) { setError(`Minimum loan amount is ₦${min.toLocaleString()}.`); return; }
      if (amount > max) { setError(`Maximum loan amount is ₦${max.toLocaleString()}.`); return; }
      if (termVal < selectedProduct.min_term_months) {
        setError(`Minimum term is ${selectedProduct.min_term_months} ${unitLabel}.`); return;
      }
      if (termVal > selectedProduct.max_term_months) {
        setError(`Maximum term is ${selectedProduct.max_term_months} ${unitLabel}.`); return;
      }
    }
    for (const fee of feePreviews) {
      if (fee.debit_destination === 'user_choice') {
        const route = feeRouting[fee.id];
        if (route?.destination === 'savings' && !route.savings_account_id) {
          setError(`Please select a savings account for fee "${fee.name}".`);
          return;
        }
      }
    }
    const feeRoutingPayload: Record<string, FeeRouting> = {};
    Object.entries(feeRouting).forEach(([k, v]) => { feeRoutingPayload[k] = v; });
    const payload: CreateLoanAccountData = {
      client: cId, product: pId, requested_amount: requestedAmount,
      repayment_frequency: repaymentFreq, term_months: termVal, term_unit: termUnit,
      application_date: applicationDate, purpose: purpose.trim() || undefined,
      fee_routing: Object.keys(feeRoutingPayload).length ? feeRoutingPayload : undefined,
      cashier_account_id: cashierAccountId ? parseInt(cashierAccountId) : undefined,
    };
    setSubmitting(true);
    try {
      const createdLoan = await loanService.createLoan(payload) as LoanAccount & { warnings?: string[] };
      const responseWarnings = Array.isArray(createdLoan?.warnings) ? createdLoan.warnings : [];
      if (responseWarnings.length) setWarnings(responseWarnings);
      setSuccess(true);
      setTimeout(() => navigate('/loans/accounts'), responseWarnings.length ? 3000 : 1500);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string; non_field_errors?: string[] };
      setError(err?.detail ?? (err?.non_field_errors ?? []).join(', ') ?? err?.message ?? 'Failed to submit.');
    } finally { setSubmitting(false); }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center max-w-sm">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-900">Application Submitted!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting to loan accounts...</p>
          {warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700 mt-2">{w}</p>)}
        </div>
      </div>
    );
  }

  const selectedClient = clientId ? (clients.find(c => String(c.id) === clientId) ?? null) : null;
  const isWeeklyClient = selectedClient
    ? (selectedClient.client_id?.startsWith('WL') || repaymentFreq === 'weekly')
    : false;

  const registrationFees = feePreviews.filter(f => f.posting_trigger === 'registration');
  const otherFees = feePreviews.filter(f => f.posting_trigger !== 'registration');
  const totalRegistrationFees = registrationFees.reduce((sum, f) => sum + parseFloat(f.calculated_amount), 0);
  // Show cashier override when any registration fee routes to cashier
  const needsCashierField = registrationFees.some(
    f => f.debit_destination === 'cashier' || f.debit_destination === 'user_choice'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">New Loan Application</h1>
              <p className="text-xs text-gray-500">Submit a new loan application for a client</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3 mb-5">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-5">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Application Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Application Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Client <span className="text-red-500">*</span></label>
                {loadingClients ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading clients...</div>
                ) : clients.length > 0 ? (
                  <select required value={clientId} onChange={e => setClientId(e.target.value)} aria-label="Client"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">-- Select client --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone_primary ? ` · ${c.phone_primary}` : ''}</option>)}
                  </select>
                ) : (
                  <input type="number" required min="1" value={clientId} onChange={e => setClientId(e.target.value)}
                    placeholder="Enter client ID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                )}
                {clientId && loadingSavings && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading savings accounts...</p>
                )}
                {clientId && !loadingSavings && clientSavings.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Info className="w-3 h-3" /> No active savings accounts for this client.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loan Product <span className="text-red-500">*</span></label>
                {loadingProducts ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading products...</div>
                ) : products.length > 0 ? (
                  <select required value={productId} onChange={e => handleProductChange(e.target.value)} aria-label="Loan product"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">-- Select product --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code}) -- {p.default_interest_rate}%</option>)}
                  </select>
                ) : (
                  <input type="number" required min="1" value={productId} onChange={e => setProductId(e.target.value)} placeholder="Product ID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Application Date <span className="text-red-500">*</span></label>
                <input type="date" required value={applicationDate} onChange={e => setApplicationDate(e.target.value)} title="Application date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Client Details — shown once a client is selected */}
          {selectedClient && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Client Information</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-blue-600 text-xs">Full Name</span>
                  <p className="font-medium text-gray-900">{selectedClient.full_name}</p>
                </div>
                {selectedClient.email && (
                  <div>
                    <span className="text-blue-600 text-xs">Email</span>
                    <p className="font-medium text-gray-900">{selectedClient.email}</p>
                  </div>
                )}
                {selectedClient.phone_primary && (
                  <div>
                    <span className="text-blue-600 text-xs">Phone</span>
                    <p className="font-medium text-gray-900">{selectedClient.phone_primary}</p>
                  </div>
                )}
                {selectedClient.phone_secondary && (
                  <div>
                    <span className="text-blue-600 text-xs">Phone 2</span>
                    <p className="font-medium text-gray-900">{selectedClient.phone_secondary}</p>
                  </div>
                )}
                {(selectedClient.address_street || selectedClient.address_city) && (
                  <div className="col-span-2">
                    <span className="text-blue-600 text-xs">Address</span>
                    <p className="font-medium text-gray-900">
                      {[
                        selectedClient.address_street,
                        selectedClient.address_city,
                        selectedClient.address_state,
                      ].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                {isWeeklyClient && selectedClient.metadata?.group_name && (
                  <div className="col-span-2">
                    <span className="text-blue-600 text-xs">Group</span>
                    <p className="font-medium text-gray-900">{selectedClient.metadata.group_name}</p>
                  </div>
                )}
              </div>
              {(selectedClient.next_of_kin_name || selectedClient.next_of_kin_phone) && (
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <p className="text-xs font-semibold text-blue-700 mb-1">
                    {isWeeklyClient ? 'Guarantor / Next of Kin' : 'Next of Kin'}
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {selectedClient.next_of_kin_name && (
                      <div>
                        <span className="text-blue-600 text-xs">Name</span>
                        <p className="font-medium text-gray-900">
                          {selectedClient.next_of_kin_name}
                          {selectedClient.next_of_kin_relationship
                            ? ` (${selectedClient.next_of_kin_relationship})`
                            : ''}
                        </p>
                      </div>
                    )}
                    {selectedClient.next_of_kin_phone && (
                      <div>
                        <span className="text-blue-600 text-xs">Phone</span>
                        <p className="font-medium text-gray-900">{selectedClient.next_of_kin_phone}</p>
                      </div>
                    )}
                    {selectedClient.next_of_kin_address && (
                      <div className="col-span-2">
                        <span className="text-blue-600 text-xs">Address</span>
                        <p className="font-medium text-gray-900">{selectedClient.next_of_kin_address}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loan Terms */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Loan Terms</h2>
            {selectedProduct && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs text-blue-700 space-y-1">
                <div>
                  <span className="font-medium">{selectedProduct.name}</span>
                  {' | '}₦{fmt(selectedProduct.min_loan_amount)} – ₦{fmt(selectedProduct.max_loan_amount)}
                  {' | '}{selectedProduct.min_term_months}–{selectedProduct.max_term_months} {selectedProduct.term_unit ?? 'months'}
                  {' | '}{selectedProduct.default_interest_rate}% p.a.
                  {' | '}{selectedProduct.interest_calculation_method === 'reducing_balance' ? 'Reducing Balance' : 'Straight Line'}
                </div>
                {(selectedProduct.first_repayment_buffer_days ?? 0) > 0 && (
                  <div className="text-blue-600">
                    First repayment starts at least {selectedProduct.first_repayment_buffer_days} days after disbursement.
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Requested Amount (N) <span className="text-red-500">*</span></label>
                <input type="number" required min="1" step="0.01" value={requestedAmount} onChange={e => setRequestedAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Repayment Frequency <span className="text-red-500">*</span></label>
                <select required value={repaymentFreq} onChange={e => setRepaymentFreq(e.target.value)} aria-label="Repayment frequency"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {(selectedProduct?.allowed_repayment_frequencies?.length
                    ? selectedProduct.allowed_repayment_frequencies
                    : REPAYMENT_FREQS.map(f => f.value)
                  ).map(v => <option key={v} value={v}>{REPAYMENT_FREQS.find(f => f.value === v)?.label ?? v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loan Term <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="number" required min="1"
                    value={termMonths} onChange={e => setTermMonths(e.target.value)}
                    placeholder="e.g. 23"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <select
                    value={termUnit}
                    onChange={e => setTermUnit(e.target.value as TermUnit)}
                    aria-label="Term unit"
                    className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                {selectedProduct && (
                  <p className="text-xs text-gray-400 mt-1">
                    Range: {selectedProduct.min_term_months}–{selectedProduct.max_term_months} {selectedProduct.term_unit ?? 'months'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loan Purpose</label>
                <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Business expansion"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Fee Preview */}
          {(loadingFees || feePreviews.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-500" />
                Fees &amp; Charges
              </h2>
              <p className="text-xs text-gray-400 mb-4">Fees are configured on the selected loan product.</p>
              {loadingFees ? (
                <div className="flex items-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Calculating fees...</div>
              ) : (
                <>
                  {registrationFees.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Collected at Registration</p>
                      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        {registrationFees.map(fee => (
                          <FeeRow key={fee.id} fee={fee} routing={feeRouting[fee.id]} clientSavings={clientSavings}
                            onDestinationChange={dest => handleRoutingDestination(fee.id, dest)}
                            onSavingsAccountChange={sid => handleRoutingSavingsAccount(fee.id, sid)} />
                        ))}
                      </div>
                      <div className="flex justify-end mt-2">
                        <span className="text-xs font-semibold text-gray-700">Total due at registration: N{fmt(totalRegistrationFees)}</span>
                      </div>
                    </div>
                  )}
                  {/* Cashier account override — only shown when at least one fee goes to cashier */}
                  {needsCashierField && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Cashier / Teller Account ID
                        <span className="ml-1 text-gray-400 font-normal">(optional — leave blank to auto-resolve)</span>
                      </label>
                      <input
                        type="number" min="1" value={cashierAccountId}
                        onChange={e => setCashierAccountId(e.target.value)}
                        placeholder="e.g. 42"
                        className="w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        If your branch has multiple teller accounts, enter the GL account ID to use for cash collection.
                      </p>
                    </div>
                  )}
                  {otherFees.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Collected Later (Approval / Disbursement)</p>
                      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        {otherFees.map(fee => (
                          <div key={fee.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">{fee.name}</span>
                              <span className="ml-2 text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                                {TRIGGER_LABEL[fee.posting_trigger] ?? fee.posting_trigger}
                              </span>
                            </div>
                            <span className="text-gray-900 font-semibold">N{fmt(fee.calculated_amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              Submit Application
            </button>
            <button type="button" onClick={() => navigate('/loans/accounts')}
              className="text-sm text-gray-500 border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-400 mt-4">
          After submission the loan enters "Pending" status and must be verified and approved before disbursement.
        </p>
      </div>
    </div>
  );
}

interface FeeRowProps {
  fee: FeePreviewItem;
  routing?: { destination: 'cashier' | 'savings'; savings_account_id: number | null };
  clientSavings: SavingsAccount[];
  onDestinationChange: (dest: 'cashier' | 'savings') => void;
  onSavingsAccountChange: (id: number | null) => void;
}

function FeeRow({ fee, routing, clientSavings, onDestinationChange, onSavingsAccountChange }: FeeRowProps) {
  const isUserChoice = fee.debit_destination === 'user_choice';
  const isSavings = fee.debit_destination === 'savings' || routing?.destination === 'savings';

  return (
    <div className="px-4 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{fee.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
              {TRIGGER_LABEL[fee.posting_trigger] ?? fee.posting_trigger}
            </span>
          </div>
          {isUserChoice && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-gray-500">Collect from:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                <input type="radio" name={"dest-" + fee.id} value="cashier"
                  checked={routing?.destination !== 'savings'}
                  onChange={() => onDestinationChange('cashier')} className="accent-blue-600" />
                <CreditCard className="w-3 h-3" /> Cashier
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                <input type="radio" name={"dest-" + fee.id} value="savings"
                  checked={routing?.destination === 'savings'}
                  onChange={() => onDestinationChange('savings')} className="accent-blue-600"
                  disabled={clientSavings.length === 0} />
                <Wallet className="w-3 h-3" /> Savings
              </label>
            </div>
          )}
          {!isUserChoice && fee.debit_destination === 'savings' && (
            <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1">
              <Wallet className="w-3 h-3" />
              Deducted from client savings{fee.default_savings_product_name ? ` (${fee.default_savings_product_name})` : ''}
            </p>
          )}
          {isSavings && clientSavings.length > 0 && (
            <div className="mt-2">
              <label className="block text-xs text-gray-500 mb-1">Savings account to debit:</label>
              <select value={routing?.savings_account_id ?? ''} aria-label={"Savings account for " + fee.name}
                onChange={e => onSavingsAccountChange(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">-- Select savings account --</option>
                {clientSavings.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.account_number} -- {s.product_name} (bal N{fmt(s.current_balance)})
                  </option>
                ))}
              </select>
            </div>
          )}
          {isSavings && clientSavings.length === 0 && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> No active savings account found for this client.
            </p>
          )}
        </div>
        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">N{fmt(fee.calculated_amount)}</span>
      </div>
    </div>
  );
}