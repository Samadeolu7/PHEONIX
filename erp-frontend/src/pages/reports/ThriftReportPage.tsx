import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Loader2, AlertCircle, PiggyBank } from 'lucide-react';
import { api } from '../../services/api';

interface ThriftAccount {
  id: number;
  account_number: string;
  client_name: string;
  client_id_code: string;
  current_balance: string;
  opened_on: string;
  status: string;
  product_name: string;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function ThriftReportPage() {
  const [items, setItems] = useState<ThriftAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/savings/accounts/', {
        params: { page_size: 500 },
      });
      const all: ThriftAccount[] = Array.isArray(res) ? res : (res as any).results ?? [];
      setItems(all);
    } catch {
      setError('Failed to load thrift savings accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i =>
    !search ||
    i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.account_number?.includes(search)
  );

  const totalBalance = filtered.reduce((s, i) => s + parseFloat(i.current_balance || '0'), 0);

  function exportCSV() {
    const header = 'Client,Account #,Balance,Opened,Status,Product';
    const rows = filtered.map(i =>
      `${i.client_name},${i.account_number},${i.current_balance},${i.opened_on},${i.status},${i.product_name}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'thrift-savings-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thrift Savings List</h1>
            <p className="text-sm text-gray-500 mt-1">All active savings accounts</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Accounts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Balance</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">₦{fmt(totalBalance)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {filtered.filter(i => i.status === 'active').length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name or account number…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <PiggyBank className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No savings accounts found.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Account #</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Balance</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Product</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Opened</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.client_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.account_number}</td>
                      <td className="px-4 py-3 text-right font-mono">₦{fmt(item.current_balance)}</td>
                      <td className="px-4 py-3 text-gray-600">{item.product_name}</td>
                      <td className="px-4 py-3 text-gray-500">{item.opened_on}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.status === 'active' ? 'bg-green-100 text-green-700' :
                          item.status === 'dormant' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-3 text-right font-semibold font-mono">₦{fmt(totalBalance)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
