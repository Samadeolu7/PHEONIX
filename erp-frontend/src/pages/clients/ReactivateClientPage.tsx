import React, { useState } from 'react';
import { Search, UserCheck, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { clientService } from '../../services/clientService';

interface ClientResult {
  id: number;
  first_name: string;
  last_name: string;
  client_id: string;
  phone_primary: string;
  status: string;
  account_manager_name?: string;
}

const STATUS_LABEL: Record<string, string> = {
  inactive: 'Inactive',
  suspended: 'Suspended',
  blacklisted: 'Blacklisted',
  dormant: 'Dormant',
};

const STATUS_COLOR: Record<string, string> = {
  inactive: 'bg-gray-100 text-gray-700',
  suspended: 'bg-orange-100 text-orange-700',
  blacklisted: 'bg-red-100 text-red-700',
  dormant: 'bg-yellow-100 text-yellow-700',
};

export default function ReactivateClientPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setSearched(true);
    try {
      const data = await clientService.getClients({ search: query.trim() });
      const items = Array.isArray(data) ? data : (data as any).results ?? [];
      const inactive = items.filter((c: ClientResult) =>
        ['inactive', 'suspended', 'blacklisted', 'dormant'].includes(c.status)
      );
      setResults(inactive);
    } catch {
      setError('Failed to search clients. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(client: ClientResult) {
    setActivating(client.id);
    setError('');
    setSuccess('');
    try {
      const result = await clientService.activateClient(client.id);
      const fee = Number(result.reactivation_fee || 0);
      const feeNote = fee > 0 ? ` A reactivation fee of ₦${fee.toLocaleString()} was deducted from their savings balance.` : '';
      setSuccess(
        `${client.first_name} ${client.last_name} (${client.client_id}) has been reactivated successfully.${feeNote}`
      );
      setResults(prev => prev.filter(c => c.id !== client.id));
    } catch (err: any) {
      const detail = err?.message;
      setError(
        detail
          ? `Failed to reactivate ${client.first_name} ${client.last_name}: ${detail}`
          : `Failed to reactivate ${client.first_name} ${client.last_name}.`
      );
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Re-activate Client Account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Search for a suspended, inactive, or blacklisted client and restore their account to active status.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, client ID, or phone number…"
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {searched && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {results.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <UserCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No inactive clients found</p>
                <p className="text-sm mt-1">All search results are already active, or no matches found.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Client ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map(client => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {client.first_name} {client.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono">{client.client_id}</td>
                      <td className="px-4 py-3 text-gray-600">{client.phone_primary}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLOR[client.status] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {STATUS_LABEL[client.status] ?? client.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleActivate(client)}
                          disabled={activating === client.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {activating === client.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserCheck className="w-3 h-3" />
                          )}
                          Reactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
