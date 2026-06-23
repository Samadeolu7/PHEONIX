import React, { useState } from 'react';
import { Calendar, ClipboardCheck, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

interface WeekSummary {
  period_start: string;
  period_end: string;
  total_disbursed: number;
  total_repayments: number;
  total_savings_deposits: number;
  total_withdrawals: number;
  new_clients: number;
  loans_matured: number;
  loans_overdue: number;
}

export default function ReviewWeekPage() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const [startDate, setStartDate] = useState(toISO(monday));
  const [endDate, setEndDate] = useState(toISO(sunday));
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const [loansRes, savingsRes, clientsRes] = await Promise.all([
        api.get('/loans/accounts/', { params: { page_size: 500 } }),
        api.get('/savings/accounts/', { params: { page_size: 500 } }),
        api.get('/clients/clients/', { params: { page_size: 500 } }),
      ]);

      const loans: any[] = Array.isArray(loansRes) ? loansRes : (loansRes as any).results ?? [];
      const clients: any[] = Array.isArray(clientsRes) ? clientsRes : (clientsRes as any).results ?? [];

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);

      const newClients = clients.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      });

      const disbursed = loans.filter(l => {
        const d = new Date(l.disbursement_date || '1970-01-01');
        return d >= start && d <= end;
      });

      setSummary({
        period_start: startDate,
        period_end: endDate,
        total_disbursed: disbursed.reduce((s, l) => s + parseFloat(l.disbursed_amount || l.approved_amount || '0'), 0),
        total_repayments: 0,
        total_savings_deposits: 0,
        total_withdrawals: 0,
        new_clients: newClients.length,
        loans_matured: loans.filter(l => l.status === 'paid_off').length,
        loans_overdue: loans.filter(l => l.status === 'overdue' || (l.days_in_arrears > 0)).length,
      });
    } catch {
      setError('Failed to generate review. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review Week</h1>
          <p className="text-sm text-gray-500 mt-1">Weekly operations summary for management review.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Week Start</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Week End</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Generate Review
          </button>
          {summary && (
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
            >
              Print
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        )}

        {summary && !loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Disbursed', value: `₦${fmt(summary.total_disbursed)}`, color: 'text-blue-600' },
                { label: 'New Clients', value: String(summary.new_clients), color: 'text-purple-600' },
                { label: 'Loans Overdue', value: String(summary.loans_overdue), color: 'text-red-600' },
                { label: 'Loans Matured', value: String(summary.loans_matured), color: 'text-green-600' },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 uppercase">{card.label}</p>
                  <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">
                Week of {summary.period_start} to {summary.period_end}
              </h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Total Loans Disbursed', `₦${fmt(summary.total_disbursed)}`],
                    ['New Clients Registered', String(summary.new_clients)],
                    ['Loans Now Overdue', String(summary.loans_overdue)],
                    ['Loans Fully Paid Off', String(summary.loans_matured)],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="py-3 text-gray-700">{label}</td>
                      <td className="py-3 text-right font-mono font-medium text-gray-900">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-4">
                Note: Repayment and savings deposit totals require transaction-level API access. Available in a future update.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
