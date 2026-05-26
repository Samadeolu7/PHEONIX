// src/pages/receivables/RecordPayment.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { apiClient } from '../../services/api/apiClient';
import { clientService, ClientOption } from '../../services/clientService';

interface Receivable {
  id: number;
  client: number;
  client_name: string;
  receivable_type: 'invoice' | 'entitlement' | 'loan' | 'other';
  object_id: number; // FK to the source object (Invoice.id, FeeEntitlement.id, etc.)
  reference_number: string;
  description: string;
  original_amount: string;
  amount_paid: string;
  balance: string;
  due_date: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  aging_bucket: string;
  days_overdue: number;
  created_at: string;
  updated_at: string;
}

interface PaymentFormData {
  amount: string;
  payment_date: string;
  payment_method: string;
  bank_account_id?: number;
  reference: string;
  notes: string;
}

interface BankAccount {
  id: number;
  account_number: string;
  account_name: string;
  bank_display_name: string;
  current_balance: string;
  is_active: boolean;
}

const RecordPayment: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [selectedClient, setSelectedClient] = useState<number>(0);
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientSearchRef = useRef<HTMLDivElement>(null);
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<number | undefined>(undefined);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'check', label: 'Check' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'online', label: 'Online Payment' },
    { value: 'other', label: 'Other' },
  ];

  useEffect(() => {
    loadClients();
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedClient > 0) {
      loadClientReceivables(selectedClient);
    } else {
      setReceivables([]);
      setSelectedReceivable(null);
    }
  }, [selectedClient]);

  // Close client dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(event.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = clientSearch.trim()
    ? clients.filter(
        c =>
          c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
          c.client_id.toLowerCase().includes(clientSearch.toLowerCase())
      )
    : clients;

  const handleClientSelect = (client: ClientOption) => {
    setSelectedClient(client.id);
    setSelectedClientName(client.name);
    setClientSearch('');
    setClientDropdownOpen(false);
  };

  const handleClientSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientSearch(e.target.value);
    setClientDropdownOpen(true);
    if (!e.target.value) {
      setSelectedClient(0);
      setSelectedClientName('');
    }
  };

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      console.error('Error loading clients:', error);
      showError('Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  };

  const loadClientReceivables = async (clientId: number) => {
    try {
      setLoadingReceivables(true);
      // Use apiClient baseURL ("/api") + endpoint path -> do NOT prefix with /api/ again
      // Request all receivables for the client (filtering by status is handled server-side)
      const url = `/receivables/receivables/?client=${clientId}&page_size=500`;
      const data = await apiClient.get(url);

      // apiClient returns response.data already. Normalize possible shapes:
      // - direct array
      // - { results: [...] }
      // - { receivables: [...] }
      const clientReceivables = Array.isArray(data)
        ? data
        : data?.results || data?.receivables || [];
      // Filter for receivables that have outstanding balance
      const outstandingReceivables = clientReceivables.filter(
        (receivable: Receivable) =>
          parseFloat(receivable.balance) > 0 && !['paid', 'cancelled'].includes(receivable.status)
      );
      setReceivables(outstandingReceivables);
    } catch (error) {
      console.error('Error loading receivables:', error);
      showError('Failed to load client receivables');
    } finally {
      setLoadingReceivables(false);
    }
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const bankData = (await apiClient.get('/banks/bank-accounts/?is_active=true')) as any;
      setBankAccounts(bankData?.results || (Array.isArray(bankData) ? bankData : []));
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleReceivableSelect = (receivableId: number) => {
    const receivable = receivables.find(rec => rec.id === receivableId);
    setSelectedReceivable(receivable || null);
    if (receivable) {
      setPaymentAmount(receivable.balance); // Default to full balance
      setPaymentNotes(`Payment for ${receivable.receivable_type} ${receivable.reference_number}`);
    }
  };

  /**
   * Determine the correct API endpoint to POST the payment to.
   *
   * Invoice payments MUST go through the invoice endpoint so that
   * IncomeAccountingService.record_income_receipt() is used — the same
   * tested path as the PaymentRecordingModal on the receivables list.
   *
   * Entitlement payments go through the entitlement endpoint.
   *
   * Loan and other types are not currently supported via this page.
   */
  const getPaymentEndpoint = (receivable: Receivable): string | null => {
    switch (receivable.receivable_type) {
      case 'invoice':
        // Use the source Invoice ID, NOT the receivable ID, so the full
        // accounting pipeline (GL entries, line-item allocations, signals) runs.
        return `/incomes/invoices/${receivable.object_id}/record_payment/`;
      case 'entitlement':
        return `/incomes/entitlements/${receivable.object_id}/record_payment/`;
      default:
        return null; // loan / other — not supported here
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedReceivable || !paymentAmount) {
      showError('Please select a receivable and enter a payment amount');
      return;
    }

    // Block unsupported receivable types before hitting the server
    const endpoint = getPaymentEndpoint(selectedReceivable);
    if (!endpoint) {
      showError(
        `Payment recording for "${selectedReceivable.receivable_type}" receivables is not supported on this page. Please use the dedicated loan or other payment screen.`
      );
      return;
    }

    const paymentAmountNum = parseFloat(paymentAmount);
    const receivableBalance = parseFloat(selectedReceivable.balance);

    if (isNaN(paymentAmountNum) || paymentAmountNum <= 0) {
      showError('Payment amount must be greater than 0');
      return;
    }

    if (paymentAmountNum > receivableBalance) {
      showError('Payment amount cannot exceed receivable balance');
      return;
    }

    // Require bank account for non-cash payments
    if (paymentMethod !== 'cash' && !selectedBankAccountId) {
      showError('Please select a bank account for this payment method');
      return;
    }

    try {
      setSubmitting(true);

      // Prepare the payment data
      const paymentData: PaymentFormData = {
        amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        bank_account_id: selectedBankAccountId,
        reference: paymentReference,
        notes: paymentNotes,
      };

      // Use the type-specific endpoint so the full accounting pipeline runs
      // (IncomeAccountingService, GL entries, line-item allocations, signals).
      // This matches the PaymentRecordingModal's approach on the receivables list.
      await apiClient.post(endpoint, paymentData);

      success('Payment recorded successfully');

      // Redirect to receivable detail page
      navigate(`/receivables/${selectedReceivable.id}/view`);
    } catch (error: any) {
      console.error('Error recording payment:', error);
      // Backend returns errors under the 'error' key (not 'message')
      const serverMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.response?.data?.detail;
      showError(serverMsg || error?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const calculateNewBalance = () => {
    if (!selectedReceivable || !paymentAmount) return 0;
    return parseFloat(selectedReceivable.balance) - parseFloat(paymentAmount);
  };

  const getNewStatus = () => {
    const newBalance = calculateNewBalance();
    if (newBalance <= 0) return 'paid';
    if (newBalance < parseFloat(selectedReceivable?.original_amount || '0')) return 'partial';
    return selectedReceivable?.status || 'pending';
  };

  const getReceivableTypeColor = (type: string) => {
    switch (type) {
      case 'invoice':
        return 'bg-blue-100 text-blue-800';
      case 'entitlement':
        return 'bg-green-100 text-green-800';
      case 'loan':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loadingClients) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Record Payment</h1>
            <p className="text-gray-600">
              Record payment for client receivables (invoices, entitlements, loans, etc.)
            </p>
          </div>
          <button
            onClick={() => navigate('/receivables/list')}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Receivables
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client and Receivable Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Client and Receivable</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <div ref={clientSearchRef} className="relative">
                <input
                  type="text"
                  title="Search clients"
                  value={
                    selectedClient > 0 && !clientDropdownOpen ? selectedClientName : clientSearch
                  }
                  onChange={handleClientSearchChange}
                  onFocus={() => setClientDropdownOpen(true)}
                  placeholder="Search by name or ID..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="off"
                />
                {selectedClient > 0 && !clientDropdownOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(0);
                      setSelectedClientName('');
                      setClientSearch('');
                      setClientDropdownOpen(true);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    title="Clear selection"
                  >
                    ✕
                  </button>
                )}
                {clientDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {loadingClients ? (
                      <div className="px-3 py-2 text-sm text-gray-500">Loading clients...</div>
                    ) : filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No clients found</div>
                    ) : (
                      filteredClients.map(client => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleClientSelect(client)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-0"
                        >
                          <span className="font-medium">{client.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">({client.client_id})</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedClient === 0 && !loadingClients && (
                <p className="text-xs text-gray-400 mt-1">{clients.length} clients available</p>
              )}
            </div>

            {/* Receivable Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Receivable <span className="text-red-500">*</span>
              </label>
              {loadingReceivables ? (
                <div className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Loading receivables...
                </div>
              ) : (
                <select
                  title="Select receivable"
                  value={selectedReceivable?.id || ''}
                  onChange={e => handleReceivableSelect(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={selectedClient === 0}
                >
                  <option value="">Select a receivable...</option>
                  {receivables.map(receivable => (
                    <option key={receivable.id} value={receivable.id}>
                      {receivable.reference_number} ({receivable.receivable_type}) -{' '}
                      {formatCurrency(receivable.balance)} - {receivable.status}
                    </option>
                  ))}
                </select>
              )}
              {selectedClient > 0 && receivables.length === 0 && !loadingReceivables && (
                <p className="text-sm text-gray-500 mt-1">
                  No outstanding receivables for this client
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Unsupported type warning */}
        {selectedReceivable &&
          (selectedReceivable.receivable_type === 'loan' ||
            selectedReceivable.receivable_type === 'other') && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-yellow-500 text-xl">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-yellow-800">
                    Payment not supported for &quot;{selectedReceivable.receivable_type}&quot;
                    receivables
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    This page supports <strong>invoice</strong> and <strong>entitlement</strong>{' '}
                    payments only. For loan repayments, please use the dedicated loan management
                    screen.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Receivable Summary + Payment Details — only for supported types */}
        {selectedReceivable &&
          (selectedReceivable.receivable_type === 'invoice' ||
            selectedReceivable.receivable_type === 'entitlement') && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Receivable Summary</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Reference Number
                  </label>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedReceivable.reference_number}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Type</label>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getReceivableTypeColor(selectedReceivable.receivable_type)}`}
                  >
                    {selectedReceivable.receivable_type.charAt(0).toUpperCase() +
                      selectedReceivable.receivable_type.slice(1)}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Original Amount</label>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(selectedReceivable.original_amount)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Amount Paid</label>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(selectedReceivable.amount_paid || '0')}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Outstanding Balance
                  </label>
                  <p className="text-lg font-semibold text-red-600">
                    {formatCurrency(selectedReceivable.balance)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Due Date</label>
                  <p className="text-sm text-gray-900">{formatDate(selectedReceivable.due_date)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Status</label>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedReceivable.status)}`}
                  >
                    {selectedReceivable.status.charAt(0).toUpperCase() +
                      selectedReceivable.status.slice(1)}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Days Overdue</label>
                  <p
                    className={`text-sm font-medium ${selectedReceivable.days_overdue > 0 ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {selectedReceivable.days_overdue > 0
                      ? `${selectedReceivable.days_overdue} days`
                      : 'Not overdue'}
                  </p>
                </div>
              </div>

              {selectedReceivable.description && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-500">Description</label>
                  <p className="text-sm text-gray-900">{selectedReceivable.description}</p>
                </div>
              )}
            </div>
          )}

        {/* Payment Details */}
        {selectedReceivable &&
          (selectedReceivable.receivable_type === 'invoice' ||
            selectedReceivable.receivable_type === 'entitlement') && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Payment Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedReceivable.balance}
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Maximum: {formatCurrency(selectedReceivable.balance)}
                  </p>
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    title="Payment Date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    title="Payment Method"
                    value={paymentMethod}
                    onChange={e => {
                      setPaymentMethod(e.target.value);
                      setSelectedBankAccountId(undefined);
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {paymentMethods.map(method => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bank Account (required for all payment methods) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Account
                    {paymentMethod !== 'cash' && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    title="Bank Account"
                    value={selectedBankAccountId || ''}
                    onChange={e =>
                      setSelectedBankAccountId(
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    disabled={loadingAccounts}
                    required={paymentMethod !== 'cash'}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">
                      {paymentMethod === 'cash' ? 'None (cash)' : 'Select bank account...'}
                    </option>
                    {bankAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.bank_display_name} – {account.account_number} (
                        {account.account_name})
                      </option>
                    ))}
                  </select>
                  {bankAccounts.length === 0 && !loadingAccounts && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ No active bank accounts found.
                    </p>
                  )}
                </div>

                {/* Payment Reference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Reference
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Transaction ID, Check number, etc."
                  />
                </div>

                {/* Payment Notes */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Notes
                  </label>
                  <textarea
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Payment notes or additional information..."
                  />
                </div>
              </div>
            </div>
          )}

        {/* Payment Preview */}
        {selectedReceivable &&
          (selectedReceivable.receivable_type === 'invoice' ||
            selectedReceivable.receivable_type === 'entitlement') &&
          paymentAmount &&
          parseFloat(paymentAmount) > 0 && (
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-blue-900 mb-4">Payment Preview</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-blue-700">New Amount Paid</label>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatCurrency(
                      (
                        parseFloat(selectedReceivable.amount_paid || '0') +
                        parseFloat(paymentAmount)
                      ).toString()
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-700">New Balance</label>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatCurrency(calculateNewBalance().toString())}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-700">New Status</label>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(getNewStatus())}`}
                  >
                    {getNewStatus().charAt(0).toUpperCase() + getNewStatus().slice(1)}
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/receivables/list')}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting || !selectedReceivable || !paymentAmount || parseFloat(paymentAmount) <= 0
            }
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Recording Payment...
              </>
            ) : (
              'Record Payment'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RecordPayment;
