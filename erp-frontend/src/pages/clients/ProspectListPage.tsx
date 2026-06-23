import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientService, Client } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';
import { Users, UserCheck } from 'lucide-react';

type ProspectStatus = 'pending' | 'contacted' | 'converted' | 'rejected';

interface ConvertModalState {
  client: Client;
  clientType: 'dc' | 'wl' | 'ml';
}

const statusConfig: Record<string, { color: string; label: string }> = {
  pending:   { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
  contacted: { color: 'bg-blue-100 text-blue-800',    label: 'Contacted' },
  converted: { color: 'bg-green-100 text-green-800',  label: 'Converted' },
  rejected:  { color: 'bg-red-100 text-red-800',      label: 'Rejected' },
  active:    { color: 'bg-green-100 text-green-800',  label: 'Active' },
  inactive:  { color: 'bg-gray-100 text-gray-800',    label: 'Inactive' },
};

const ProspectListPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [prospects, setProspects] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ count: 0, next: null as null | string, previous: null as null | string, currentPage: 1 });

  const [converting, setConverting] = useState<number | null>(null);
  const [convertModal, setConvertModal] = useState<ConvertModalState | null>(null);

  const loadProspects = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        usage_context: 'prospect',
        page,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const res = await clientService.getClients(params as any);
      setProspects(res.results || []);
      setPagination({
        count: res.count || 0,
        next: res.next,
        previous: res.previous,
        currentPage: page,
      });
    } catch {
      showError('Failed to load prospects');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadProspects(1);
  }, [loadProspects]);

  const handleConvert = async () => {
    if (!convertModal) return;
    try {
      setConverting(convertModal.client.id);
      await clientService.convertProspect(convertModal.client.id, {
        client_type: convertModal.clientType,
      });
      success(`${convertModal.client.full_name} converted to client`);
      setConvertModal(null);
      loadProspects(pagination.currentPage);
    } catch (e: any) {
      showError(e?.message || 'Failed to convert prospect');
    } finally {
      setConverting(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB');

  const getStatusBadge = (status: string) => {
    const cfg = statusConfig[status] ?? { color: 'bg-gray-100 text-gray-700', label: status };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Prospects</h1>
            </div>
            <p className="text-gray-600">View and convert prospects to full clients</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Prospects</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.count}</p>
            </div>
            <Users className="w-8 h-8 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {prospects.filter(p => p.status === 'inactive').length}
              </p>
            </div>
            <UserCheck className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active/Converted</p>
              <p className="text-2xl font-bold text-green-600">
                {prospects.filter(p => p.status === 'active').length}
              </p>
            </div>
            <UserCheck className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); }}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <UserCheck size={20} className="text-indigo-500" />
            Prospect Directory ({pagination.count})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Phone', 'Email', 'Registered', 'Status', 'Actions'].map(col => (
                      <th
                        key={col}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {prospects.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-indigo-700 font-medium text-lg">
                              {p.full_name.charAt(0)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{p.full_name}</div>
                            <div className="text-sm text-gray-500">ID: {p.client_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {p.phone_primary}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {p.email || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(p.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => navigate(`/clients/${p.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View
                          </button>
                          <button
                            onClick={() =>
                              setConvertModal({ client: p, clientType: 'dc' })
                            }
                            disabled={converting === p.id}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          >
                            Convert
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {prospects.length === 0 && (
                <div className="text-center py-12">
                  <UserCheck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No prospects found</h3>
                  <p className="text-gray-600">
                    {search || statusFilter
                      ? 'Try adjusting your filters.'
                      : 'No prospects have been registered yet.'}
                  </p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Page {pagination.currentPage} of {Math.ceil(pagination.count / 20)} —{' '}
                    {pagination.count} total
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => loadProspects(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm font-medium text-gray-900 bg-indigo-50 border border-indigo-200 rounded-md">
                      Page {pagination.currentPage}
                    </span>
                    <button
                      onClick={() => loadProspects(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Convert Modal */}
      {convertModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-40"
              onClick={() => setConvertModal(null)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Convert Prospect</h2>
              <p className="text-sm text-gray-600 mb-6">
                Convert <span className="font-medium">{convertModal.client.full_name}</span> to a
                full client. Select the client type:
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Type</label>
                <select
                  value={convertModal.clientType}
                  onChange={e =>
                    setConvertModal(prev =>
                      prev ? { ...prev, clientType: e.target.value as 'dc' | 'wl' | 'ml' } : null
                    )
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="dc">Daily Contribution (DC)</option>
                  <option value="wl">Weekly/Loan (WL)</option>
                  <option value="ml">Monthly Loan (ML)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConvertModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvert}
                  disabled={converting !== null}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserCheck size={16} />
                  {converting !== null ? 'Converting...' : 'Convert to Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProspectListPage;
