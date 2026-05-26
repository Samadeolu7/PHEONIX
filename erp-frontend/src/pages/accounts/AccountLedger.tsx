import React, { useState } from 'react';
import { ArrowLeft, Download, Printer, TrendingUp, TrendingDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAccountLedger } from '../../hooks/useLedger';

const AccountLedger: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<{
    date_from?: string;
    date_to?: string;
    include_unapproved?: boolean;
  }>({
    include_unapproved: false,
  });

  const { data: ledger, isLoading } = useAccountLedger(
    parseInt(accountId || '0'),
    filters,
    !!accountId
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

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!ledger) return;

    // Create CSV content
    const headers = [
      'Date',
      'Transaction #',
      'Client',
      'Description',
      'Debit',
      'Credit',
      'Balance',
    ];
    const rows = ledger.entries.map(entry => [
      formatDate(entry.date),
      `TXN-${entry.transaction_id.toString().padStart(6, '0')}`,
      entry.client_name || '',
      entry.description,
      entry.debit_amount,
      entry.credit_amount,
      entry.running_balance,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `account-ledger-${ledger.account_code}-${new Date().toISOString().split('T')[0]}.csv`;
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

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 print:hidden">
        <button
          onClick={() => navigate('/accounts')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Accounts
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{ledger.account_name}</h1>
            <p className="text-gray-600 mt-1">Account Code: {ledger.account_code}</p>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-2 ${
                ledger.account_type === 'ASSET'
                  ? 'bg-blue-100 text-blue-800'
                  : ledger.account_type === 'LIABILITY'
                    ? 'bg-red-100 text-red-800'
                    : ledger.account_type === 'INCOME'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
              }`}
            >
              {ledger.account_type}
            </span>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.include_unapproved}
                onChange={e =>
                  setFilters(prev => ({ ...prev, include_unapproved: e.target.checked }))
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Include unapproved transactions</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Opening Balance</p>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(ledger.opening_balance)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Total Debits</p>
          <p className="text-xl font-bold text-green-600 flex items-center">
            <TrendingUp className="w-5 h-5 mr-1" />
            {formatCurrency(ledger.total_debits)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Total Credits</p>
          <p className="text-xl font-bold text-red-600 flex items-center">
            <TrendingDown className="w-5 h-5 mr-1" />
            {formatCurrency(ledger.total_credits)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Closing Balance</p>
          <p className="text-xl font-bold text-blue-600">
            {formatCurrency(ledger.closing_balance)}
          </p>
        </div>
      </div>

      {/* Ledger Entries Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 print:p-0">
          <h2 className="text-xl font-semibold mb-4 print:text-center">Account Ledger</h2>

          {ledger.entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No transactions found for the selected period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
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
                  {/* Opening Balance Row */}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {filters.date_from ? formatDate(filters.date_from) : 'Opening'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" colSpan={3}>
                      Opening Balance
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      -
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      -
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(ledger.opening_balance)}
                    </td>
                  </tr>

                  {/* Transaction Entries */}
                  {ledger.entries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-blue-600">
                          TXN-{entry.transaction_id.toString().padStart(6, '0')}
                        </span>
                        {!entry.is_approved && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {entry.client_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>{entry.description}</div>
                        {entry.reference && (
                          <div className="text-xs text-gray-500">Ref: {entry.reference}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                        {parseFloat(entry.debit_amount) > 0
                          ? formatCurrency(entry.debit_amount)
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">
                        {parseFloat(entry.credit_amount) > 0
                          ? formatCurrency(entry.credit_amount)
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                        {formatCurrency(entry.running_balance)}
                      </td>
                    </tr>
                  ))}

                  {/* Closing Balance Row */}
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {filters.date_to ? formatDate(filters.date_to) : 'Closing'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan={3}>
                      Closing Balance
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(ledger.total_debits)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(ledger.total_credits)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 text-right">
                      {formatCurrency(ledger.closing_balance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">{ledger.account_name} - Account Ledger</h1>
          <p className="text-gray-600">
            Period: {filters.date_from ? formatDate(filters.date_from) : 'Beginning'} to{' '}
            {filters.date_to ? formatDate(filters.date_to) : 'Present'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountLedger;
