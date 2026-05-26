// src/pages/clients/ClientListPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientService, Client, ClientFilters } from '../../services/clientService';
import { triggerDownload } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users,
  UserCheck,
  UserX,
  Download,
} from 'lucide-react';

const ClientListPage: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ClientFilters>({});
  const [classifications, setClassifications] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const { success, error: showError } = useToast();
  const { selectedRole } = useAuth();

  const canCreateClients = selectedRole && selectedRole !== 'Principal';

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const classData = await clientService.getClassifications();
      setClassifications(classData);
      const response = await clientService.getClients(filters);
      setClients(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      showError('Failed to load client data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (clientId: number, clientName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${clientName}? This action cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await clientService.deleteClient(clientId);
      success('Client deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Error deleting client:', error);
      showError(error.message || 'Failed to delete client');
    }
  };

  const handleFilterChange = (key: keyof ClientFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleExportCSV = async () => {
    try {
      setExportLoading(true);
      const { page: _page, ...exportFilters } = filters as any;
      const blob = await clientService.exportCsv(exportFilters);
      triggerDownload(blob, `clients_export_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      console.error('CSV export failed:', err);
      showError('Failed to export clients');
    } finally {
      setExportLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getStatusBadge = (status: Client['status']) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      active:      { color: 'bg-green-100 text-green-800',  label: 'Active' },
      inactive:    { color: 'bg-gray-100 text-gray-800',    label: 'Inactive' },
      suspended:   { color: 'bg-yellow-100 text-yellow-800', label: 'Suspended' },
      blacklisted: { color: 'bg-red-100 text-red-800',      label: 'Blacklisted' },
    };
    const config = statusConfig[status] ?? { color: 'bg-gray-100 text-gray-700', label: status };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getGenderIcon = (gender: Client['gender']) => {
    const icons: Record<string, string> = { male: 'ðŸ‘¨', female: 'ðŸ‘©', other: 'ðŸ‘¤' };
    return icons[gender] ?? 'ðŸ‘¤';
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Client Management</h1>
            </div>
            <p className="text-gray-600">
              Manage all clients, track account status, and view classifications
            </p>
          </div>
          {canCreateClients && (
            <button
              onClick={() => navigate('/clients/create')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-2"
            >
              <Users size={18} />
              Add New Client
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.count}</p>
            </div>
            <Users className="w-8 h-8 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {clients.filter(c => c.status === 'active').length}
              </p>
            </div>
            <UserCheck className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inactive / Suspended</p>
              <p className="text-2xl font-bold text-gray-600">
                {clients.filter(c => c.status !== 'active').length}
              </p>
            </div>
            <UserX className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Users size={20} className="text-indigo-500" />
          Filter Clients
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="blacklisted">Blacklisted</option>
            </select>
          </div>

          {/* Classification Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
            <select
              value={filters.classification || ''}
              onChange={e =>
                handleFilterChange(
                  'classification',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Groups</option>
              {classifications.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Client name, ID, or phone..."
              value={filters.search || ''}
              onChange={e => handleFilterChange('search', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => setFilters({})}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Users size={20} className="text-indigo-500" />
                  Client Directory ({pagination.count} clients)
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={handleExportCSV}
                    disabled={exportLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={16} />
                    {exportLoading ? 'Exporting...' : 'Download CSV'}
                  </button>
                  <button
                    onClick={() => navigate('/clients/import')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    Import Clients
                  </button>
                  <button
                    onClick={() => navigate('/clients/classifications')}
                    className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
                  >
                    Manage Groups
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Age / Gender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Group
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Registered
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map(client => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {(client as any).image ? (
                              <img
                                className="h-10 w-10 rounded-full object-cover"
                                src={(client as any).image}
                                alt={client.full_name}
                              />
                            ) : (
                              <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                <span className="text-indigo-700 font-medium text-lg">
                                  {client.full_name.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {client.full_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {client.client_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.phone_primary}</div>
                        <div className="text-sm text-gray-500">{client.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.age} yrs</div>
                        <div className="text-sm text-gray-500 capitalize flex items-center gap-1">
                          {getGenderIcon(client.gender)} {client.gender}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {client.classification_name || 'â€”'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(client.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(client.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View
                          </button>
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client.id, client.full_name)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Page {pagination.currentPage} of {Math.ceil(pagination.count / 20)} â€”{' '}
                    {pagination.count} total clients
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm font-medium text-gray-900 bg-indigo-50 border border-indigo-200 rounded-md">
                      Page {pagination.currentPage}
                    </span>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {clients.length === 0 && !loading && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
                <p className="text-gray-600 mb-4">
                  {canCreateClients
                    ? 'Try adjusting your filters or add a new client to get started.'
                    : 'No clients match your current filters.'}
                </p>
                {canCreateClients && (
                  <button
                    onClick={() => navigate('/clients/create')}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 inline-flex items-center gap-2"
                  >
                    <Users size={18} />
                    Add First Client
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ClientListPage;
