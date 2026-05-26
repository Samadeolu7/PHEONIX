import React, { useState, useEffect } from 'react';
import { Plus, Search, X, CreditCard, Building2, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import bankService from '../../services/bankService';
import type { BankAccount } from '../../types/banks';

const BankAccountListPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    is_active: true,
    is_cashier_collection_account: undefined as boolean | undefined,
    bank: undefined as number | undefined,
  });

  useEffect(() => {
    loadAccounts();
  }, [filters]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await bankService.listBankAccounts({
        is_active: filters.is_active ? true : undefined,
        is_cashier_collection_account: filters.is_cashier_collection_account,
        bank: filters.bank,
        search: searchTerm || undefined,
      });
      // Handle both array and paginated response formats
      const accountsList = Array.isArray(data) ? data : data.results || [];
      setAccounts(accountsList);
    } catch (err: any) {
      setError(err.message || 'Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = accounts.filter(
    account =>
      account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.account_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.bank_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalBalance = filteredAccounts.reduce(
    (sum, acc) => sum + parseFloat(acc.current_balance || '0'),
    0
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-gray-600 mt-1">Track and manage your organization's bank accounts</p>
        </div>
        <button
          onClick={() => navigate('/banks/accounts/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Add Bank Account
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Accounts</p>
              <p className="text-2xl font-bold text-gray-900">{filteredAccounts.length}</p>
            </div>
            <CreditCard className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Balance</p>
              <p className="text-2xl font-bold text-green-600">₦{totalBalance.toLocaleString()}</p>
            </div>
            <DollarSign className="w-10 h-10 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Accounts</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredAccounts.filter(a => a.is_active).length}
              </p>
            </div>
            <Building2 className="w-10 h-10 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.is_active}
              onChange={e => setFilters({ ...filters, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Active only
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.is_cashier_collection_account || false}
              onChange={e =>
                setFilters({
                  ...filters,
                  is_cashier_collection_account: e.target.checked || undefined,
                })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Cashier accounts
          </label>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Accounts Table */}
      {!loading && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Flags
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAccounts.map(account => (
                <tr
                  key={account.id}
                  onClick={() => navigate(`/banks/accounts/${account.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {account.account_name}
                      </div>
                      <div className="text-sm text-gray-500">{account.account_number}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{account.bank_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                      {account.account_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      ₦{parseFloat(account.current_balance).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        account.is_active && !account.is_suspended
                          ? 'bg-green-100 text-green-800'
                          : account.is_suspended
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {account.is_suspended
                        ? 'Suspended'
                        : account.is_active
                          ? 'Active'
                          : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex gap-1 justify-center">
                      {account.is_cashier_collection_account && (
                        <span
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                          title="Cashier Collection Account"
                        >
                          Cashier
                        </span>
                      )}
                      {account.requires_dual_approval && (
                        <span
                          className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
                          title="Requires Dual Approval"
                        >
                          Dual
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty State */}
          {filteredAccounts.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bank accounts found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm
                  ? 'Try adjusting your search criteria'
                  : 'Get started by adding your first bank account'}
              </p>
              <button
                onClick={() => navigate('/banks/accounts/new')}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                Add Account
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BankAccountListPage;
