import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Download,
  Filter,
  ChevronRight,
  ArrowUpDown,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';

// TransactionRow Component
function TransactionRow({ transaction, onClick, showWorkflowLink = true }: any) {
  const isPositive = (transaction as any).amount > 0;

  const getStatusIcon = () => {
    switch ((transaction as any).status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div
      onClick={() => onClick && onClick(transaction)}
      className={`p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        {/* Left side: Icon + Info */}
        <div className="flex items-center space-x-4 flex-1">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isPositive ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-6 h-6 text-green-600" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h4 className="font-semibold text-gray-900 truncate">
                {transaction.description || transaction.type}
              </h4>
              {getStatusIcon()}
            </div>

            <div className="flex items-center space-x-3 mt-1 text-sm text-gray-500">
              <span className="font-mono text-xs">{transaction.reference}</span>
              <span>•</span>
              <span>{new Date(transaction.date).toLocaleDateString()}</span>
              {transaction.account && (
                <>
                  <span>•</span>
                  <span className="truncate">{transaction.account.name}</span>
                </>
              )}
            </div>

            {showWorkflowLink && transaction.workflow_run && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  navigate(`/workflows/${transaction.workflow_run.id}`);
                }}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center space-x-1"
              >
                <span>View Workflow</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right side: Amount */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className={`text-xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}
              {transaction.amount.toLocaleString('en-US', {
                style: 'currency',
                currency: transaction.currency || 'USD',
              })}
            </div>
            <div
              className={`text-xs font-semibold mt-1 px-2 py-1 rounded-full inline-block ${
                transaction.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-800'
                  : transaction.status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              {transaction.status}
            </div>
          </div>
          {onClick && <ChevronRight className="w-5 h-5 text-gray-400" />}
        </div>
      </div>
    </div>
  );
}

// TransactionList Component
function TransactionList({
  transactions = [],
  loading = false,
  showWorkflowLink = true,
  onTransactionClick = null,
  showFilters = true,
  showExport = true,
}) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Filter transactions
  const filteredTransactions = transactions.filter(txn => {
    if (filterStatus !== 'all' && txn.status !== filterStatus) return false;
    if (filterType !== 'all') {
      const isDeposit = txn.amount > 0;
      if (filterType === 'deposit' && !isDeposit) return false;
      if (filterType === 'withdrawal' && isDeposit) return false;
    }
    return true;
  });

  // Sort transactions
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];

    if (sortBy === 'date') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleSort = field => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleExport = () => {
    // In production, this would export to CSV
    console.log('Exporting transactions:', sortedTransactions);
    alert('Export functionality would download CSV here');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Transactions</h3>
        <p className="text-gray-500">No transactions found for this account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions Bar */}
      {(showFilters || showExport) && (
        <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
          <div className="flex items-center space-x-4">
            {showFilters && (
              <>
                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>

                {/* Type Filter */}
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Types</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdrawal">Withdrawals</option>
                </select>

                {/* Sort */}
                <button
                  onClick={() => handleSort('date')}
                  className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span>Sort by Date</span>
                </button>
              </>
            )}
          </div>

          {showExport && (
            <button
              onClick={handleExport}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-gray-900">{filteredTransactions.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4">
          <p className="text-sm text-green-600 mb-1">Total Deposits</p>
          <p className="text-2xl font-bold text-green-700">
            {filteredTransactions
              .filter(t => t.amount > 0)
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </p>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4">
          <p className="text-sm text-red-600 mb-1">Total Withdrawals</p>
          <p className="text-2xl font-bold text-red-700">
            {Math.abs(
              filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
            ).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </p>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-3">
        {sortedTransactions.map(transaction => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onClick={onTransactionClick}
            showWorkflowLink={showWorkflowLink}
          />
        ))}
      </div>

      {/* Load More / Pagination */}
      {sortedTransactions.length >= 10 && (
        <div className="text-center">
          <button className="px-6 py-2 text-blue-600 hover:text-blue-700 font-medium">
            Load More Transactions
          </button>
        </div>
      )}
    </div>
  );
}

// Example Standalone Demo
export default function TransactionComponentsDemo() {
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const sampleTransactions = [
    {
      id: 1,
      date: '2025-01-22',
      amount: 500,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      description: 'Salary deposit',
      reference: 'TXN-001',
      currency: 'NGN',
      account: { name: "John's Savings", id: 123 },
      workflow_run: { id: 789, status: 'completed' },
    },
    {
      id: 2,
      date: '2025-01-20',
      amount: -100,
      type: 'WITHDRAWAL',
      status: 'COMPLETED',
      description: 'ATM withdrawal',
      reference: 'TXN-002',
      currency: 'NGN',
      account: { name: "John's Savings", id: 123 },
      workflow_run: { id: 788, status: 'completed' },
    },
    {
      id: 3,
      date: '2025-01-18',
      amount: 1000,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      description: 'Initial deposit',
      reference: 'TXN-003',
      currency: 'NGN',
      account: { name: "John's Savings", id: 123 },
      workflow_run: { id: 787, status: 'completed' },
    },
    {
      id: 4,
      date: '2025-01-15',
      amount: -50,
      type: 'WITHDRAWAL',
      status: 'PENDING',
      description: 'Pending transfer',
      reference: 'TXN-004',
      currency: 'NGN',
      account: { name: "John's Savings", id: 123 },
      workflow_run: { id: 786, status: 'running' },
    },
  ];

  const handleTransactionClick = transaction => {
    console.log('Transaction clicked:', transaction);
    setSelectedTransaction(transaction);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Transaction Components Demo</h1>
          <p className="text-gray-600">
            Reusable transaction components with filtering, sorting, and export
          </p>
        </div>

        <TransactionList
          transactions={sampleTransactions}
          loading={false}
          showWorkflowLink={true}
          onTransactionClick={handleTransactionClick}
          showFilters={true}
          showExport={true}
        />

        {selectedTransaction && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-900 font-semibold">Selected Transaction:</p>
            <pre className="text-sm text-blue-800 mt-2">
              {JSON.stringify(selectedTransaction, null, 2)}
            </pre>
            <button
              onClick={() => setSelectedTransaction(null)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export individual components for use elsewhere
export { TransactionList, TransactionRow };
