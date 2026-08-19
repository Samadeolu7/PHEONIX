import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Printer,
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClientLedger } from '../../hooks/useLedger';
import { useDomainLabels } from '../../contexts/DomainLabelContext';

const ClientLedgerPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { isSchool } = useDomainLabels();

  const [filters, setFilters] = useState<{
    date_from?: string;
    date_to?: string;
  }>({});

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showReversedEntries, setShowReversedEntries] = useState(false);

  const { data: ledger, isLoading } = useClientLedger(
    parseInt(clientId || '0'),
    filters,
    !!clientId
  );

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `₦${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const toggleRow = (reference: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(reference)) {
      newExpanded.delete(reference);
    } else {
      newExpanded.add(reference);
    }
    setExpandedRows(newExpanded);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!ledger) return;

    // Create CSV content
    const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = ledger.ledger_entries.map(entry => [
      formatDate(entry.date),
      entry.transaction_type === 'invoice'
        ? 'Invoice'
        : entry.transaction_type === 'payment_reversal'
          ? 'Payment Reversal'
          : 'Payment',
      entry.reference,
      entry.description,
      entry.debit || '0.00',
      entry.credit || '0.00',
      entry.balance,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${ledger.client.name.replace(/\s+/g, '-')}-${
      new Date().toISOString().split('T')[0]
    }.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Account ledger not found</p>
        </div>
      </div>
    );
  }

  const reversedCount = ledger.ledger_entries.filter(
    (entry) => entry.is_reversed || entry.is_reversal
  ).length;
  const visibleEntriesRaw = showReversedEntries
    ? ledger.ledger_entries
    : ledger.ledger_entries.filter((entry) => !entry.is_reversed && !entry.is_reversal);
  // The server's per-entry `balance` reflects the true chronological history, so a
  // reversed entry's effect is still baked into every row between it and its later
  // reversal counter-entry. Recompute a running balance over just the visible rows
  // so hiding reversed entries doesn't leave a temporarily wrong balance in between.
  const ledgerOpeningBalance = ledger.ledger_entries.length > 0
    ? ledger.ledger_entries[0].balance - ledger.ledger_entries[0].debit + ledger.ledger_entries[0].credit
    : 0;
  let runningLedgerBalance = ledgerOpeningBalance;
  const visibleEntries = visibleEntriesRaw.map((entry) => {
    runningLedgerBalance += entry.debit - entry.credit;
    return { ...entry, balance: runningLedgerBalance };
  });

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 print:hidden">
        <button
          onClick={() => navigate(`/clients/${clientId}`)}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to {isSchool ? 'Student' : 'Client'} Profile
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Ledger</h1>
            <p className="text-gray-600 mt-1">{ledger.client.name}</p>
            {ledger.client.client_id && (
              <p className="text-sm text-gray-500">ID: {ledger.client.client_id}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={e =>
                setFilters(prev => ({ ...prev, date_from: e.target.value || undefined }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={e =>
                setFilters(prev => ({ ...prev, date_to: e.target.value || undefined }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Invoiced</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(ledger.summary.total_invoiced)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Paid</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(ledger.summary.total_paid)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Current Balance</p>
              <p
                className={`text-xl font-bold ${
                  ledger.summary.current_balance > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {formatCurrency(ledger.summary.current_balance)}
              </p>
            </div>
            <div
              className={`p-3 rounded-lg ${
                ledger.summary.current_balance > 0 ? 'bg-red-100' : 'bg-green-100'
              }`}
            >
              <DollarSign
                className={`w-6 h-6 ${
                  ledger.summary.current_balance > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 print:p-0">
          <h2 className="text-xl font-semibold mb-4 print:text-center">Account Ledger</h2>

          {reversedCount > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 mb-4 print:hidden">
              <span className="text-xs text-gray-500">
                {showReversedEntries
                  ? `Showing all entries, including ${reversedCount} reversed`
                  : `${reversedCount} reversed entr${reversedCount === 1 ? 'y' : 'ies'} hidden — balances recalculated for the entries shown`}
              </span>
              <button
                type="button"
                onClick={() => setShowReversedEntries((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                {showReversedEntries ? <EyeOff size={12} /> : <Eye size={12} />}
                {showReversedEntries ? 'Hide reversed' : 'Show reversed'}
              </button>
            </div>
          )}

          {ledger.ledger_entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No transactions found for the selected period</p>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                All entries in this period are reversed.{' '}
                <button
                  type="button"
                  onClick={() => setShowReversedEntries(true)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Show them
                </button>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                      {/* Expand icon column */}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Debit
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credit
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {visibleEntries.map((entry, index) => {
                    const isExpanded = expandedRows.has(entry.reference);
                    return (
                      <React.Fragment key={`${entry.reference}-${index}`}>
                        <tr className={`hover:bg-gray-50 ${entry.is_reversed || entry.is_reversal ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-4 whitespace-nowrap">
                            {entry.details && (
                              <button
                                onClick={() => toggleRow(entry.reference)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(entry.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                entry.transaction_type === 'invoice'
                                  ? 'bg-blue-100 text-blue-800'
                                  : entry.transaction_type === 'payment_reversal'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {entry.transaction_type === 'invoice' ? (
                                <>
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  Invoice
                                </>
                              ) : entry.transaction_type === 'payment_reversal' ? (
                                <>
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Payment Reversal
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="w-3 h-3 mr-1" />
                                  Payment
                                </>
                              )}
                            </span>
                            {entry.invoice_type && (
                              <div className="text-xs text-gray-500 mt-1">
                                {entry.invoice_type === 'service' ? 'Service' : 'Inventory'}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {entry.invoice_id ? (
                              <button
                                onClick={() =>
                                  navigate(
                                    `/sales/invoices/${
                                      entry.invoice_type === 'inventory' ? 'inventory/' : ''
                                    }${entry.invoice_id}`
                                  )
                                }
                                className="text-sm text-blue-600 hover:text-blue-800 font-mono"
                              >
                                {entry.reference}
                              </button>
                            ) : (
                              <span className="text-sm text-gray-900 font-mono">
                                {entry.reference}
                              </span>
                            )}
                            {entry.related_invoice && (
                              <div className="text-xs text-gray-500 mt-1">
                                For: {entry.related_invoice}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {entry.description}
                            {entry.status && (
                              <span
                                className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  entry.status === 'paid'
                                    ? 'bg-green-100 text-green-800'
                                    : entry.status === 'partial'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {entry.status.toUpperCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                            {entry.debit > 0 ? (
                              <span className="text-red-600">{formatCurrency(entry.debit)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                            {entry.credit > 0 ? (
                              <span className="text-green-600">{formatCurrency(entry.credit)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">
                            <span className={entry.balance > 0 ? 'text-red-600' : 'text-green-600'}>
                              {formatCurrency(entry.balance)}
                            </span>
                          </td>
                        </tr>
                        {/* Expandable details row */}
                        {isExpanded && entry.details && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-12 py-4">
                              <div className="bg-white rounded-lg border border-gray-200 p-4">
                                {entry.transaction_type === 'invoice' ? (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-3">
                                        Invoice Details
                                      </h4>
                                      <dl className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Created By:</dt>
                                          <dd className="text-gray-900 font-medium">
                                            {entry.details.created_by || 'N/A'}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Created At:</dt>
                                          <dd className="text-gray-900">
                                            {entry.details.created_at
                                              ? formatDate(entry.details.created_at)
                                              : 'N/A'}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Due Date:</dt>
                                          <dd className="text-gray-900">
                                            {entry.details.due_date
                                              ? formatDate(entry.details.due_date)
                                              : 'N/A'}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Posted:</dt>
                                          <dd className="text-gray-900">
                                            {entry.details.is_posted ? 'Yes' : 'No'}
                                          </dd>
                                        </div>
                                        {entry.details.is_posted && (
                                          <>
                                            <div className="flex justify-between">
                                              <dt className="text-gray-600">Posted By:</dt>
                                              <dd className="text-gray-900 font-medium">
                                                {entry.details.posted_by || 'N/A'}
                                              </dd>
                                            </div>
                                            <div className="flex justify-between">
                                              <dt className="text-gray-600">Posted At:</dt>
                                              <dd className="text-gray-900">
                                                {entry.details.posted_at
                                                  ? formatDate(entry.details.posted_at)
                                                  : 'N/A'}
                                              </dd>
                                            </div>
                                          </>
                                        )}
                                      </dl>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-3">
                                        Amount Breakdown
                                      </h4>
                                      <dl className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Subtotal:</dt>
                                          <dd className="text-gray-900">
                                            {formatCurrency(entry.details.subtotal || 0)}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Discount:</dt>
                                          <dd className="text-red-600">
                                            -
                                            {formatCurrency(
                                              entry.details.discount_amount ||
                                                entry.details.discount ||
                                                0
                                            )}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Tax:</dt>
                                          <dd className="text-gray-900">
                                            {formatCurrency(entry.details.tax_amount || 0)}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between border-t pt-2 font-semibold">
                                          <dt className="text-gray-900">Total:</dt>
                                          <dd className="text-gray-900">
                                            {formatCurrency(entry.debit)}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Amount Paid:</dt>
                                          <dd className="text-green-600">
                                            {formatCurrency(entry.details.amount_paid || 0)}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between border-t pt-2 font-semibold">
                                          <dt className="text-gray-900">Balance Due:</dt>
                                          <dd className="text-red-600">
                                            {formatCurrency(entry.details.balance || 0)}
                                          </dd>
                                        </div>
                                      </dl>
                                      {entry.details.notes && (
                                        <div className="mt-4 pt-4 border-t">
                                          <h5 className="font-medium text-gray-700 mb-1">Notes:</h5>
                                          <p className="text-sm text-gray-600">
                                            {entry.details.notes}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-3">
                                        {entry.transaction_type === 'payment_reversal'
                                          ? 'Payment Reversal Details'
                                          : 'Payment Details'}
                                      </h4>
                                      <dl className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Recorded By:</dt>
                                          <dd className="text-gray-900 font-medium">
                                            {entry.details.created_by || 'N/A'}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Recorded At:</dt>
                                          <dd className="text-gray-900">
                                            {entry.details.created_at
                                              ? formatDate(entry.details.created_at)
                                              : 'N/A'}
                                          </dd>
                                        </div>
                                        <div className="flex justify-between">
                                          <dt className="text-gray-600">Approved:</dt>
                                          <dd className="text-gray-900">
                                            {entry.details.approved ? 'Yes' : 'No'}
                                          </dd>
                                        </div>
                                        {entry.details.approved && (
                                          <>
                                            <div className="flex justify-between">
                                              <dt className="text-gray-600">Approved By:</dt>
                                              <dd className="text-gray-900 font-medium">
                                                {entry.details.approved_by || 'N/A'}
                                              </dd>
                                            </div>
                                            <div className="flex justify-between">
                                              <dt className="text-gray-600">Approved At:</dt>
                                              <dd className="text-gray-900">
                                                {entry.details.approved_at
                                                  ? formatDate(entry.details.approved_at)
                                                  : 'N/A'}
                                              </dd>
                                            </div>
                                          </>
                                        )}
                                        {entry.details.is_reversed && (
                                          <div className="flex justify-between">
                                            <dt className="text-gray-600">Status:</dt>
                                            <dd className="text-red-600 font-medium">REVERSED</dd>
                                          </div>
                                        )}
                                        {entry.details.is_reversal && (
                                          <div className="flex justify-between">
                                            <dt className="text-gray-600">Type:</dt>
                                            <dd className="text-orange-600 font-medium">
                                              PAYMENT REVERSAL
                                            </dd>
                                          </div>
                                        )}
                                        {entry.details.workflow_reference && (
                                          <div className="flex justify-between">
                                            <dt className="text-gray-600">Workflow Ref:</dt>
                                            <dd className="text-gray-900 font-mono text-xs">
                                              {entry.details.workflow_reference}
                                            </dd>
                                          </div>
                                        )}
                                      </dl>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-3">
                                        Journal Entries
                                      </h4>
                                      {entry.details.entries && entry.details.entries.length > 0 ? (
                                        <div className="space-y-2">
                                          {entry.details.entries.map((journalEntry, idx) => (
                                            <div
                                              key={idx}
                                              className="flex justify-between text-sm p-2 bg-gray-50 rounded"
                                            >
                                              <div>
                                                <div className="font-mono text-xs text-gray-600">
                                                  {journalEntry.account_code}
                                                </div>
                                                <div className="text-gray-900">
                                                  {journalEntry.account_name}
                                                </div>
                                              </div>
                                              <div className="text-right">
                                                <div
                                                  className={`font-medium ${journalEntry.side === 'DR' ? 'text-red-600' : 'text-green-600'}`}
                                                >
                                                  {journalEntry.side}
                                                </div>
                                                <div className="text-gray-900">
                                                  {formatCurrency(journalEntry.amount)}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500">
                                          No entries available
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-bold">
                    <td colSpan={5} className="px-6 py-4 text-sm text-gray-900 text-right">
                      Totals:
                    </td>
                    <td className="px-6 py-4 text-sm text-red-600 text-right">
                      {formatCurrency(ledger.summary.total_invoiced)}
                    </td>
                    <td className="px-6 py-4 text-sm text-green-600 text-right">
                      {formatCurrency(ledger.summary.total_paid)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span
                        className={
                          ledger.summary.current_balance > 0 ? 'text-red-600' : 'text-green-600'
                        }
                      >
                        {formatCurrency(ledger.summary.current_balance)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:text-center {
            text-align: center !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default ClientLedgerPage;
