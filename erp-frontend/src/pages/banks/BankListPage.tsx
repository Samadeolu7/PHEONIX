import React, { useState } from 'react';
import { Plus, Edit, Trash2, Building2, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBanks, useDeleteBank, useCreateBank } from '../../hooks/useBanks';
import { useDebounce } from '../../hooks/useDebounce';

const BankListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const {
    data: banks = [],
    isLoading,
    error: queryError,
  } = useBanks({
    is_active: showActiveOnly ? true : undefined,
    search: debouncedSearch || undefined,
  });

  const deleteMutation = useDeleteBank();

  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this bank?')) return;
    deleteMutation.mutate(id, {
      onError: (err: Error) => alert(err.message || 'Failed to delete bank'),
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Banks</h1>
          <p className="text-gray-600 mt-1">Manage banking institutions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Add Bank
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search banks..."
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
              checked={showActiveOnly}
              onChange={e => setShowActiveOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Active only
          </label>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {queryError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {(queryError as Error).message || 'Failed to load banks'}
        </div>
      )}

      {/* Banks Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banks.map(bank => (
            <div
              key={bank.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/banks/${bank.id}`)}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{bank.bank_name}</h3>
                      {bank.branch_name && (
                        <p className="text-sm text-gray-500">{bank.branch_name}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      bank.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {bank.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  {bank.bank_code && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bank Code:</span>
                      <span className="font-medium">{bank.bank_code}</span>
                    </div>
                  )}
                  {bank.accounts_count !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Accounts:</span>
                      <span className="font-medium">{bank.accounts_count}</span>
                    </div>
                  )}
                  {bank.total_balance && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Balance:</span>
                      <span className="font-medium text-green-600">
                        ₦{parseFloat(bank.total_balance).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {bank.account_manager_name && (
                  <div className="text-xs text-gray-500 border-t pt-2">
                    Manager: {bank.account_manager_name}
                  </div>
                )}

                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/banks/${bank.id}/edit`);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(bank.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && banks.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No banks found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm
              ? 'Try adjusting your search criteria'
              : 'Get started by adding your first bank'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Add Bank
          </button>
        </div>
      )}

      {/* Create Bank Modal */}
      {showCreateModal && (
        <CreateBankModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

// Create Bank Modal Component
const CreateBankModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const createBank = useCreateBank();
  const [formData, setFormData] = useState({
    bank_name: '',
    bank_code: '',
    branch_name: '',
    address: '',
    phone: '',
    email: '',
    account_manager_name: '',
    account_manager_phone: '',
    account_manager_email: '',
    notes: '',
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await createBank.mutateAsync(formData);
      alert(
        `Bank "${formData.bank_name}" created successfully! Next step: Create a bank account at this bank to link it with your GL account and assign an approver.`
      );
      onSuccess();
    } catch (err: unknown) {
      const e = err as { message?: string; details?: Record<string, unknown> };
      const details = e.details;
      let msg = e.message || '';
      if (details && typeof details === 'object') {
        const fieldErrors = Object.entries(details)
          .flatMap(([field, errs]) => {
            const list = Array.isArray(errs) ? errs : [errs];
            return list.map(m =>
              field === 'non_field_errors' ? String(m) : `${field}: ${String(m)}`
            );
          })
          .join('  |  ');
        if (fieldErrors) msg = fieldErrors;
      }
      setError(msg || 'Failed to create bank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Add New Bank Institution</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600">
            Register the bank institution details. After creating the bank, you&apos;ll be able to
            add your organization&apos;s specific accounts at this bank.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This form creates the bank institution record (e.g.,
              &quot;First Bank Nigeria&quot;). To add your organization&apos;s specific account at
              this bank (with GL account and approver), use the &quot;Bank Accounts&quot; page after
              creating this bank.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={formData.bank_name}
                onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Code</label>
              <input
                type="text"
                value={formData.bank_code}
                onChange={e => setFormData({ ...formData, bank_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
              <input
                type="text"
                value={formData.branch_name}
                onChange={e => setFormData({ ...formData, branch_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <h3 className="font-medium text-gray-900 mb-2">Account Manager</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
              <input
                type="text"
                value={formData.account_manager_name}
                onChange={e => setFormData({ ...formData, account_manager_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone</label>
              <input
                type="tel"
                value={formData.account_manager_phone}
                onChange={e => setFormData({ ...formData, account_manager_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
              <input
                type="email"
                value={formData.account_manager_email}
                onChange={e => setFormData({ ...formData, account_manager_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createBank.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createBank.isPending ? 'Creating...' : 'Create Bank'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankListPage;
