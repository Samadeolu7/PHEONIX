import React, { useState } from 'react';
import { ArrowLeft, Download, Printer, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClientStatement, useOutstandingInvoices } from '../../hooks/useLedger';

const ClientStatement: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<{
    date_from?: string;
    date_to?: string;
    include_paid?: boolean;
    invoice_type?: 'service' | 'inventory' | 'all';
  }>({
    include_paid: true,
    invoice_type: 'all',
  });

  const { data: statement, isLoading } = useClientStatement(
    parseInt(clientId || '0'),
    filters,
    !!clientId
  );
  const { data: outstanding } = useOutstandingInvoices(parseInt(clientId || '0'), !!clientId);

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
    if (!statement) return;

    // Create CSV content
    const headers = [
      'Date',
      'Type',
      'Invoice #',
      'Description',
      'Amount',
      'Paid',
      'Balance',
      'Status',
    ];
    const rows = statement.items.map(item => [
      formatDate(item.date),
      item.invoice_type,
      item.invoice_number,
      item.description,
      item.total_amount,
      item.amount_paid,
      item.balance_due,
      item.payment_status,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${statement.client_name.replace(/\s+/g, '-')}-${
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

  if (!statement) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Statement of account not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 print:hidden">
        <button
          onClick={() => navigate('/clients')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Clients
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Statement of Account</h1>
            <p className="text-gray-600 mt-1">{statement.client_name}</p>
            {statement.client_code && (
              <p className="text-sm text-gray-500">Code: {statement.client_code}</p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Type</label>
            <select
              value={filters.invoice_type}
              onChange={e =>
                setFilters(prev => ({
                  ...prev,
                  invoice_type: e.target.value as 'service' | 'inventory' | 'all',
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="service">Service Invoices</option>
              <option value="inventory">Inventory Invoices</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.include_paid}
                onChange={e => setFilters(prev => ({ ...prev, include_paid: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Include paid invoices</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Total Invoiced</p>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(statement.total_invoiced)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Total Paid</p>
          <p className="text-xl font-bold text-green-600 flex items-center">
            <CheckCircle className="w-5 h-5 mr-1" />
            {formatCurrency(statement.total_paid)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Outstanding Balance</p>
          <p className="text-xl font-bold text-red-600 flex items-center">
            <AlertCircle className="w-5 h-5 mr-1" />
            {formatCurrency(statement.outstanding_balance)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-600">Unpaid Invoices</p>
          <p className="text-xl font-bold text-orange-600">{outstanding?.count || 0}</p>
        </div>
      </div>

      {/* Statement Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 print:p-0">
          <h2 className="text-xl font-semibold mb-4 print:text-center">Statement of Account</h2>

          {statement.items.length === 0 ? (
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
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paid
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statement.items.map(item => (
                    <tr
                      key={`${item.invoice_type}-${item.invoice_id}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.invoice_type === 'service'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.invoice_type === 'service' ? 'Service' : 'Inventory'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() =>
                            navigate(
                              `/sales/invoices/${
                                item.invoice_type === 'inventory' ? 'inventory/' : ''
                              }${item.invoice_id}`
                            )
                          }
                          className="text-sm text-blue-600 hover:text-blue-800 font-mono"
                        >
                          {item.invoice_number}
                        </button>
                        {item.material_request_number && (
                          <button
                            onClick={() =>
                              navigate(`/inventory/material-requests/${item.material_request_id}`)
                            }
                            className="block text-xs text-purple-600 hover:text-purple-800 mt-1"
                          >
                            MR: {item.material_request_number}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.description}
                        {item.recipient_name && (
                          <div className="text-xs text-gray-500">For: {item.recipient_name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(item.total_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                        {formatCurrency(item.amount_paid)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600 text-right">
                        {formatCurrency(item.balance_due)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.payment_status === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : item.payment_status === 'partial'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {item.payment_status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Summary Row */}
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan={4}>
                      Total
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(statement.total_invoiced)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                      {formatCurrency(statement.total_paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                      {formatCurrency(statement.outstanding_balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Outstanding Invoices Summary */}
      {outstanding && outstanding.invoices.length > 0 && (
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-orange-900 mb-4 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            Outstanding Invoices ({outstanding.count})
          </h3>
          <div className="space-y-2">
            {outstanding.invoices.map(invoice => (
              <div
                key={invoice.invoice_id}
                className="flex justify-between items-center bg-white rounded p-3"
              >
                <div>
                  <button
                    onClick={() => navigate(`/sales/invoices/${invoice.invoice_id}`)}
                    className="text-blue-600 hover:text-blue-800 font-mono font-medium"
                  >
                    {invoice.invoice_number}
                  </button>
                  <p className="text-sm text-gray-600">Due: {formatDate(invoice.due_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Balance Due</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(invoice.balance_due)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-orange-200">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-orange-900">Total Outstanding:</span>
              <span className="text-2xl font-bold text-red-600">
                {formatCurrency(outstanding.total_outstanding)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Print-only header */}
      <div className="hidden print:block">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Statement of Account</h1>
          <p className="text-lg">{statement.client_name}</p>
          <p className="text-gray-600">
            Period: {filters.date_from ? formatDate(filters.date_from) : 'Beginning'} to{' '}
            {filters.date_to ? formatDate(filters.date_to) : 'Present'}
          </p>
          <p className="text-gray-600 mt-2">Generated on: {formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
};

export default ClientStatement;
