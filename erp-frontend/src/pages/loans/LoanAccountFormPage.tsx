/**
 * New Loan Application Page
 * Creates a new loan account (application) for a client.
 * After submission the loan enters 'pending' status awaiting verification and approval.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { loanService, LoanProduct, CreateLoanAccountData } from '../../services/loanService';

const REPAYMENT_FREQS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function LoanAccountFormPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null);

  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [repaymentFreq, setRepaymentFreq] = useState('monthly');
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await loanService.listProducts({ is_active: true });
      setProducts(data);
    } catch {
      /* ignore - product select falls back to ID input */
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function handleProductChange(id: string) {
    setProductId(id);
    const p = products.find(x => String(x.id) === id) ?? null;
    setSelectedProduct(p);
    if (p) {
      // Pre-fill defaults from the product
      if (!requestedAmount) setRequestedAmount(p.min_loan_amount);
      if (!termMonths) setTermMonths(String(p.min_term_months));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cId = parseInt(clientId);
    const pId = parseInt(productId);
    const amount = parseFloat(requestedAmount);
    const months = parseInt(termMonths);

    if (!cId || isNaN(cId))     { setError('Please enter a valid client ID.'); return; }
    if (!pId || isNaN(pId))     { setError('Please select a loan product.'); return; }
    if (!amount || amount <= 0) { setError('Requested amount must be greater than zero.'); return; }
    if (!months || months <= 0) { setError('Term must be at least 1 month.'); return; }

    // Validate against product limits
    if (selectedProduct) {
      const min = parseFloat(selectedProduct.min_loan_amount);
      const max = parseFloat(selectedProduct.max_loan_amount);
      if (amount < min) { setError(`Minimum loan amount for this product is ₦${min.toLocaleString()}.`); return; }
      if (amount > max) { setError(`Maximum loan amount for this product is ₦${max.toLocaleString()}.`); return; }
      if (months < selectedProduct.min_term_months) {
        setError(`Minimum term for this product is ${selectedProduct.min_term_months} months.`); return;
      }
      if (months > selectedProduct.max_term_months) {
        setError(`Maximum term for this product is ${selectedProduct.max_term_months} months.`); return;
      }
    }

    const payload: CreateLoanAccountData = {
      client: cId,
      product: pId,
      requested_amount: requestedAmount,
      repayment_frequency: repaymentFreq,
      term_months: months,
      application_date: applicationDate,
      purpose: purpose.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await loanService.createLoan(payload);
      setSuccess(true);
      setTimeout(() => navigate('/loans/accounts'), 1500);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string; non_field_errors?: string[] };
      const msg =
        err?.detail ??
        (err?.non_field_errors ?? []).join(', ') ??
        err?.message ??
        'Failed to submit loan application.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center max-w-sm">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-900">Application Submitted!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting to loan accounts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
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
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-5">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Client & Product */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Application Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Client ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="Enter client ID"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">Client ID from the clients list</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Loan Product <span className="text-red-500">*</span>
                </label>
                {loadingProducts ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading products…
                  </div>
                ) : products.length > 0 ? (
                  <select
                    required
                    value={productId}
                    onChange={e => handleProductChange(e.target.value)}
                    aria-label="Loan product"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">— Select product —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) — {p.default_interest_rate}%
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    required
                    min="1"
                    value={productId}
                    onChange={e => setProductId(e.target.value)}
                    placeholder="Product ID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Application Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={applicationDate}
                  onChange={e => setApplicationDate(e.target.value)}
                  title="Loan application date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Loan Terms */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Loan Terms</h2>

            {/* Product summary if selected */}
            {selectedProduct && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs text-blue-700">
                <span className="font-medium">{selectedProduct.name}</span>
                {' · '}Amount: ₦{parseFloat(selectedProduct.min_loan_amount).toLocaleString()} – ₦{parseFloat(selectedProduct.max_loan_amount).toLocaleString()}
                {' · '}Term: {selectedProduct.min_term_months}–{selectedProduct.max_term_months} months
                {' · '}Rate: {selectedProduct.default_interest_rate}%
                {' · '}{selectedProduct.interest_calculation_method === 'flat' ? 'Flat Rate' : 'Reducing Balance'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Requested Amount (₦) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={requestedAmount}
                  onChange={e => setRequestedAmount(e.target.value)}
                  title="Requested loan amount in naira"
                  placeholder="e.g. 50000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Repayment Frequency <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={repaymentFreq}
                  onChange={e => setRepaymentFreq(e.target.value)}
                  aria-label="Repayment frequency"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {REPAYMENT_FREQS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Term (months) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={termMonths}
                  onChange={e => setTermMonths(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loan Purpose</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="e.g. Business expansion"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              Submit Application
            </button>
            <button
              type="button"
              onClick={() => navigate('/loans/accounts')}
              className="text-sm text-gray-500 border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-400 mt-4">
          After submission the loan enters "Pending" status. It must be verified and approved before disbursement.
        </p>
      </div>
    </div>
  );
}
