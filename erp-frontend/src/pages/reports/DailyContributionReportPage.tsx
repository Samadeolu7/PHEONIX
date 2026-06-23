import React, { useState } from 'react';
import { Calendar, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { getSavingsCollectionSheet, ContributionScheduleItem } from '../../services/savingsService';

function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function DailyContributionReportPage() {
  const today = toISO(new Date());
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<ContributionScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const data = await getSavingsCollectionSheet({ date, cycle: 'daily' });
      setItems(data);
      setGenerated(true);
    } catch {
      setError('Failed to load contribution data.');
    } finally {
      setLoading(false);
    }
  }

  const paid = items.filter(i => i.status === 'paid');
  const pending = items.filter(i => i.status === 'pending');
  const totalCollected = paid.reduce((s, i) => s + parseFloat(i.expected_amount || '0'), 0);
  const totalExpected = items.reduce((s, i) => s + parseFloat(i.expected_amount || '0'), 0);

  function exportCSV() {
    const header = 'Client,Account #,Expected Amount,Status';
    const rows = items.map(i =>
      `${i.client_name},${i.account_number},${i.expected_amount},${i.status}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-contribution-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Contribution Report</h1>
            <p className="text-sm text-gray-500 mt-1">View all thrift collections for a selected date</p>
          </div>
          {generated && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate Report'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {generated && !loading && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase">Total Expected</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₦{fmt(totalExpected)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase">Collected</p>
                <p className="text-xl font-bold text-green-600 mt-1">₦{fmt(totalCollected)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase">Paid</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{paid.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase">Pending</p>
                <p className="text-xl font-bold text-orange-600 mt-1">{pending.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {items.length === 0 ? (
                <div className="p-10 text-center text-gray-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p>No contributions scheduled for {date}.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Account #</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Expected</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={item.id} className={item.status === 'paid' ? 'bg-green-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.client_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.account_number}</td>
                        <td className="px-4 py-3 text-right font-mono">₦{fmt(item.expected_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700">
                        Total ({paid.length}/{items.length} paid)
                      </td>
                      <td className="px-4 py-3 text-right font-semibold font-mono">₦{fmt(totalCollected)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
