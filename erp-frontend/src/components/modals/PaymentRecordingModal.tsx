import React, { useState, useEffect } from 'react';
import { DollarSign, X, AlertCircle, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { Invoice, InvoiceItem, LineItemAllocation } from '../../services/invoiceService';
import { apiClient } from '../../services/api/apiClient';

export interface PaymentData {
  amount: string;
  payment_date: string;
  payment_method:
    | 'cash'
    | 'bank_transfer'
    | 'check'
    | 'credit_card'
    | 'mobile_money'
    | 'online'
    | 'other';
  bank_account_id?: number;
  reference?: string;
  notes?: string;
  /** Per-line-item allocations. If absent the backend distributes proportionally. */
  line_item_allocations?: LineItemAllocation[];
}

interface BankAccount {
  id: number;
  account_number: string;
  account_name: string;
  bank_display_name: string;
  current_balance: string;
  is_active: boolean;
  is_suspended: boolean;
}

export interface PaymentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestedAmount?: string;
}

interface PaymentRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (paymentData: PaymentData) => Promise<void>;
  invoice: Invoice;
  isLoading?: boolean;
}

const PaymentRecordingModal: React.FC<PaymentRecordingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  invoice,
  isLoading = false,
}) => {
  const [paymentData, setPaymentData] = useState<PaymentData>({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  });

  const [validation, setValidation] = useState<PaymentValidation>({
    isValid: false,
    errors: [],
    warnings: [],
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Add state for selected percentage
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);

  // Line-item allocation state: map of item.id → amount string
  const [itemAllocations, setItemAllocations] = useState<Record<number, string>>({});
  const [showLineItems, setShowLineItems] = useState(false);

  const hasLineItems = invoice.items && invoice.items.length > 0;

  /** Recompute allocations proportionally whenever the total payment amount changes */
  const recomputeAllocationsProportionally = (totalAmount: string) => {
    if (!hasLineItems) return;
    const total = parseFloat(totalAmount || '0');
    if (total <= 0) {
      setItemAllocations({});
      return;
    }
    const items = invoice.items;
    const totalBalance = items.reduce((sum, item) => {
      const itemBalance =
        parseFloat(item.line_balance ?? item.line_total ?? '0') -
        parseFloat(item.amount_paid ?? '0');
      return sum + Math.max(0, itemBalance);
    }, 0);
    if (totalBalance <= 0) return;
    let remaining = total;
    const newAllocations: Record<number, string> = {};
    items.forEach((item, idx) => {
      if (!item.id) return;
      const itemBalance = Math.max(
        0,
        parseFloat(item.line_balance ?? item.line_total ?? '0') -
          parseFloat(item.amount_paid ?? '0')
      );
      if (itemBalance <= 0) {
        newAllocations[item.id] = '0.00';
        return;
      }
      const proportion = itemBalance / totalBalance;
      let alloc =
        idx === items.length - 1
          ? remaining
          : Math.min(Math.round(proportion * total * 100) / 100, itemBalance);
      alloc = Math.min(alloc, remaining);
      if (alloc < 0) alloc = 0;
      newAllocations[item.id] = alloc.toFixed(2);
      remaining = Math.max(0, remaining - alloc);
    });
    setItemAllocations(newAllocations);
  };

  // Fetch available accounts when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    }
  }, [isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPaymentData({
        amount: invoice.balance, // Default to full balance
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank_transfer',
        reference: '',
        notes: '',
      });
      setSelectedPercentage(100); // Set full as selected
      setValidation({ isValid: false, errors: [], warnings: [] });
      recomputeAllocationsProportionally(invoice.balance);
    } else {
      // Reset form when closing
      setPaymentData({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank_transfer',
        reference: '',
        notes: '',
      });
      setSelectedPercentage(null);
      setItemAllocations({});
      setValidation({ isValid: false, errors: [], warnings: [] });
    }
  }, [isOpen, invoice.balance]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      // Fetch active bank accounts from the banks app
      const bankData = (await apiClient.get('/banks/bank-accounts/?is_active=true')) as any;
      setBankAccounts(bankData?.results || (Array.isArray(bankData) ? bankData : []));
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Real-time validation
  useEffect(() => {
    validatePayment();
  }, [paymentData, invoice]);

  const validatePayment = (): PaymentValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let suggestedAmount: string | undefined;

    const paymentAmount = parseFloat(paymentData.amount || '0');
    const invoiceBalance = parseFloat(invoice.balance);

    // Required field validation
    if (!paymentData.amount || paymentData.amount.trim() === '') {
      errors.push('Payment amount is required');
    } else if (paymentAmount <= 0) {
      errors.push('Payment amount must be greater than 0');
    } else if (paymentAmount > invoiceBalance) {
      errors.push(
        `Payment amount cannot exceed invoice balance of ${formatCurrency(invoice.balance)}`
      );
    }

    if (!paymentData.payment_date) {
      errors.push('Payment date is required');
    } else {
      const paymentDate = new Date(paymentData.payment_date);
      const today = new Date();
      const futureLimit = new Date();
      futureLimit.setDate(today.getDate() + 30); // Allow up to 30 days in future

      if (paymentDate > futureLimit) {
        warnings.push('Payment date is more than 30 days in the future');
      }
    }

    // Account selection validation — require a bank account when accounts are available
    if (bankAccounts.length > 0 && !paymentData.bank_account_id) {
      errors.push('Please select a bank account for this payment');
    }

    // Payment method specific validation
    if (paymentData.payment_method === 'check' && !paymentData.reference?.trim()) {
      warnings.push('Check number is recommended for check payments');
    }

    if (paymentData.payment_method === 'bank_transfer' && !paymentData.reference?.trim()) {
      warnings.push('Transaction reference is recommended for bank transfers');
    }

    // Suggest full payment if partial
    if (paymentAmount > 0 && paymentAmount < invoiceBalance) {
      const difference = invoiceBalance - paymentAmount;
      if (difference < invoiceBalance * 0.1) {
        // If remaining is less than 10% of total
        suggestedAmount = invoice.balance;
        warnings.push(
          `Consider paying the full balance (${formatCurrency(invoice.balance)}) to close the invoice`
        );
      }
    }

    const validationResult: PaymentValidation = {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestedAmount,
    };

    setValidation(validationResult);
    return validationResult;
  };

  const formatCurrency = (amount: string): string => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };

  const calculateRemainingBalance = (): string => {
    const paymentAmount = parseFloat(paymentData.amount || '0');
    const invoiceBalance = parseFloat(invoice.balance);
    const remaining = Math.max(0, invoiceBalance - paymentAmount);
    return remaining.toString();
  };

  const handleSubmit = async () => {
    const validationResult = validatePayment();
    if (!validationResult.isValid) {
      return;
    }

    // Build line item allocations if we have items with explicit amounts
    let lineItemAllocations: LineItemAllocation[] | undefined;
    if (hasLineItems && Object.keys(itemAllocations).length > 0) {
      const entries = Object.entries(itemAllocations)
        .map(([id, amt]) => ({ invoice_item_id: parseInt(id), amount: amt }))
        .filter(e => parseFloat(e.amount) > 0);
      if (entries.length > 0) {
        lineItemAllocations = entries;
      }
    }

    try {
      await onSubmit({
        ...paymentData,
        line_item_allocations: lineItemAllocations,
      });
    } catch (error) {
      // Error handling is done by the parent component
      console.error('Payment submission error:', error);
    }
  };

  const handleAmountChange = (value: string) => {
    // Allow only valid decimal numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPaymentData(prev => ({ ...prev, amount: value }));
      // Clear percentage selection when manually typing
      setSelectedPercentage(null);
      recomputeAllocationsProportionally(value);
    }
  };

  const setFullBalance = () => {
    setPaymentData(prev => ({ ...prev, amount: invoice.balance }));
    setSelectedPercentage(100);
    recomputeAllocationsProportionally(invoice.balance);
  };

  const setPartialAmount = (percentage: number) => {
    const amount = ((parseFloat(invoice.balance) * percentage) / 100).toFixed(2);
    setPaymentData(prev => ({ ...prev, amount }));
    setSelectedPercentage(percentage);
    recomputeAllocationsProportionally(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div
        className={`relative top-20 mx-auto p-5 border w-full shadow-lg rounded-md bg-white ${hasLineItems ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <DollarSign className="h-6 w-6 text-green-600 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Record Payment</h3>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Invoice Summary */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">
              Invoice: <span className="font-medium">{invoice.invoice_number}</span>
            </p>
            <p className="text-sm text-gray-600 mb-1">
              Client: <span className="font-medium">{invoice.client_name}</span>
            </p>
            <p className="text-sm font-medium text-gray-900">
              Outstanding Balance:{' '}
              <span className="text-green-600">{formatCurrency(invoice.balance)}</span>
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Payment Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={paymentData.amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  disabled={isLoading}
                  className={`w-full border rounded-md px-3 py-2 text-sm pr-10 ${
                    validation.errors.some(e => e.includes('amount'))
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-300 focus:border-blue-500'
                  } ${isLoading ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                  placeholder="0.00"
                />
                <button
                  type="button"
                  onClick={setFullBalance}
                  disabled={isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                  title="Set to full balance"
                >
                  <Calculator className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Amount Buttons with highlighting */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setPartialAmount(25)}
                  disabled={isLoading}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    selectedPercentage === 25
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setPartialAmount(50)}
                  disabled={isLoading}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    selectedPercentage === 50
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setPartialAmount(75)}
                  disabled={isLoading}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    selectedPercentage === 75
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={setFullBalance}
                  disabled={isLoading}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    selectedPercentage === 100
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  } disabled:opacity-50`}
                >
                  Full
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-1">
                Maximum: {formatCurrency(invoice.balance)}
              </p>
            </div>

            {/* Line Item Allocation Section */}
            {hasLineItems && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowLineItems(prev => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <span>Allocate payment across line items</span>
                  {showLineItems ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showLineItems && (
                  <div className="p-3 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">
                      Specify how much of the payment applies to each line item. Amounts are
                      pre-filled proportionally — adjust as needed.
                    </p>
                    {invoice.items.map(item => {
                      if (!item.id) return null;
                      const itemId = item.id;
                      const lineTotal = parseFloat(item.line_total ?? '0');
                      const alreadyPaid = parseFloat(item.amount_paid ?? '0');
                      const itemBalance = Math.max(0, lineTotal - alreadyPaid);
                      const allocAmt = parseFloat(itemAllocations[itemId] ?? '0');
                      const allocPct =
                        lineTotal > 0
                          ? Math.min(100, ((alreadyPaid + allocAmt) / lineTotal) * 100)
                          : 0;

                      return (
                        <div key={itemId} className="p-2 bg-gray-50 rounded-md">
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-medium text-gray-800 truncate">
                                  {item.description}
                                </p>
                                {item.creates_entitlement && (
                                  <span
                                    className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"
                                    title="Payment to this item creates/updates a service entitlement"
                                  >
                                    Entitlement
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                Total: {formatCurrency(item.line_total ?? '0')} | Paid:{' '}
                                {formatCurrency(item.amount_paid ?? '0')} | Balance:{' '}
                                <span
                                  className={itemBalance > 0 ? 'text-red-600' : 'text-green-600'}
                                >
                                  {formatCurrency(itemBalance.toString())}
                                </span>
                              </p>
                            </div>
                            <div className="w-24 flex-shrink-0">
                              <input
                                type="text"
                                value={itemAllocations[itemId] ?? '0.00'}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                    setItemAllocations(prev => ({ ...prev, [itemId]: val }));
                                  }
                                }}
                                disabled={isLoading || itemBalance <= 0}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right focus:border-blue-500 disabled:bg-gray-100"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          {/* Mini progress bar showing paid+this-allocation vs total */}
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className="bg-green-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, allocPct)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 text-right">
                            {allocPct.toFixed(1)}% paid
                          </p>
                        </div>
                      );
                    })}

                    {/* Allocation total vs payment total */}
                    {(() => {
                      const allocTotal = Object.values(itemAllocations).reduce(
                        (s, v) => s + parseFloat(v || '0'),
                        0
                      );
                      const paymentTotal = parseFloat(paymentData.amount || '0');
                      const diff = Math.abs(allocTotal - paymentTotal);
                      const isOver = allocTotal > paymentTotal;
                      return (
                        <div
                          className={`flex justify-between text-xs font-medium pt-2 border-t ${
                            diff > 0.01
                              ? isOver
                                ? 'text-red-600'
                                : 'text-yellow-600'
                              : 'text-green-600'
                          }`}
                        >
                          <span>Allocation total:</span>
                          <span>
                            {formatCurrency(allocTotal.toFixed(2))} /{' '}
                            {formatCurrency(paymentData.amount || '0')}
                            {diff > 0.01 && (
                              <span className="ml-1">
                                ({isOver ? '+' : '-'}
                                {formatCurrency(diff.toFixed(2))} {isOver ? 'over' : 'unallocated'})
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentData.payment_date}
                onChange={e => setPaymentData(prev => ({ ...prev, payment_date: e.target.value }))}
                disabled={isLoading}
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  validation.errors.some(e => e.includes('date'))
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                } ${isLoading ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                required
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentData.payment_method}
                onChange={e => {
                  const method = e.target.value as PaymentData['payment_method'];
                  setPaymentData(prev => ({
                    ...prev,
                    payment_method: method,
                    // Clear account selections when changing method
                    bank_account_id: undefined,
                  }));
                }}
                disabled={isLoading}
                className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 ${
                  isLoading ? 'bg-gray-50 cursor-not-allowed' : ''
                }`}
              >
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="credit_card">Credit Card</option>
                <option value="online">Online Payment</option>
                <option value="other">Other</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                🏦 Payment will be routed to the selected bank account
              </p>
            </div>

            {/* Bank Account Selection (required for all payment methods) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Account <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentData.bank_account_id || ''}
                onChange={e =>
                  setPaymentData(prev => ({
                    ...prev,
                    bank_account_id: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                title="Bank Account"
                disabled={isLoading || loadingAccounts}
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  validation.errors.some(e => e.includes('bank account'))
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                } ${isLoading || loadingAccounts ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              >
                <option value="">Select bank account...</option>
                {bankAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.bank_display_name} – {account.account_number} ({account.account_name})
                    | Bal: ₦{account.current_balance}
                  </option>
                ))}
              </select>
              {bankAccounts.length === 0 && !loadingAccounts && (
                <p className="text-xs text-yellow-600 mt-1">
                  ⚠️ No bank accounts found. Please set up a bank account in Bank Management first.
                </p>
              )}
            </div>

            {/* Reference Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={paymentData.reference}
                onChange={e => setPaymentData(prev => ({ ...prev, reference: e.target.value }))}
                disabled={isLoading}
                className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 ${
                  isLoading ? 'bg-gray-50 cursor-not-allowed' : ''
                }`}
                placeholder="Transaction reference, check number, etc."
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={paymentData.notes}
                onChange={e => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                disabled={isLoading}
                rows={2}
                className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-500 ${
                  isLoading ? 'bg-gray-50 cursor-not-allowed' : ''
                }`}
                placeholder="Additional notes about this payment..."
              />
            </div>

            {/* Validation Messages */}
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <div className="space-y-2">
                {validation.errors.map((error, index) => (
                  <div
                    key={`error-${index}`}
                    className="flex items-center gap-2 text-sm text-red-600"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ))}
                {validation.warnings.map((warning, index) => (
                  <div
                    key={`warning-${index}`}
                    className="flex items-center gap-2 text-sm text-yellow-600"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Payment Summary */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Current Balance:</span>
                <span className="font-medium">{formatCurrency(invoice.balance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Payment Amount:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(paymentData.amount || '0')}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                <span>Remaining Balance:</span>
                <span
                  className={
                    parseFloat(calculateRemainingBalance()) === 0
                      ? 'text-green-600'
                      : 'text-gray-900'
                  }
                >
                  {formatCurrency(calculateRemainingBalance())}
                </span>
              </div>
              {parseFloat(calculateRemainingBalance()) === 0 && (
                <div className="text-xs text-green-600 mt-1 font-medium">
                  ✓ Invoice will be fully paid
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!validation.isValid || isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentRecordingModal;
