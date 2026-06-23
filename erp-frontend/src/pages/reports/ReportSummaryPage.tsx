import React, { useState } from 'react';
import { Calendar, Loader2, AlertCircle, BarChart2, Download } from 'lucide-react';
import { api } from '../../services/api';

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function toISO(d: Date) { return d.toISOString().split('T')[0]; }

interface Summary {
  loans_disbursed: number;
  loan_repayments: number;
  savings_deposits: number;
  savings_withdrawals: number;
  new_clients: number;
  active_loans: number;
  defaulted_loans: number;
  total_savings_balance: number;
  total_loan_outstanding: number;
}

export default function ReportSummaryPage() {
  const today = toISO(new Date());
  const firstOfMonth = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loanData, setLoanData] = useState<any[]>([]);
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
      const savings: any[] = Array.isArray(savingsRes) ? savingsRes : (savingsRes as any).results ?? [];
      const clients: any[] = Array.isArray(clientsRes) ? clientsRes : (clientsRes as any).results ?? [];

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);

      const disbursed = loans.filter(l => {
        const d = new Date(l.disbursement_date || l.created_at);
        return d >= start && d <= end;
      });

      const newClients = clients.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      });

      const s: Summary = {
        loans_disbursed: disbursed.reduce((sum, l) => sum + parseFloat(l.disbursed_amount || l.approved_amount || '0'), 0),
        loan_repayments: 0,
        savings_deposits: 0,
        savings_withdrawals: 0,
        new_clients: newClients.length,
        active_loans: loans.filter(l => ['active', 'disbursed'].includes(l.status)).length,
        defaulted_loans: loans.filter(l => l.status === 'defaulted').length,
        total_savings_balance: savings.reduce((sum, s) => sum + parseFloat(s.current_balance || '0'), 0),
        total_loan_outstanding: loans
          .filter(l => ['active', 'disbursed', 'overdue', 'defaulted'].includes(l.status))
          .reduce((sum, l) => sum + parseFloat(l.total_outstanding || l.outstanding_principal || '0'), 0),
      };

      setSummary(s);
      setLoanData(loans);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Report Summary by Date</h1>
            <p className="text-sm text-gray-500 mt-1">Portfolio snapshot for a date range</p>
          </div>
          {summary && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Print
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
            Generate Report
          </button>
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
                { label: 'Loans Disbursed', value: `₦${fmt(summary.loans_disbursed)}`, color: 'text-blue-600' },
                { label: 'Total Outstanding', value: `₦${fmt(summary.total_loan_outstanding)}`, color: 'text-red-600' },
                { label: 'Total Savings', value: `₦${fmt(summary.total_savings_balance)}`, color: 'text-green-600' },
                { label: 'New Clients', value: String(summary.new_clients), color: 'text-purple-600' },
                { label: 'Active Loans', value: String(summary.active_loans), color: 'text-teal-600' },
                { label: 'Defaulted Loans', value: String(summary.defaulted_loans), color: 'text-orange-600' },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                  <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Period: {startDate} to {endDate}</h2>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="pb-2 text-left font-semibold text-gray-600">Metric</th>
                    <th className="pb-2 text-right font-semibold text-gray-600">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['Loans Disbursed (period)', `₦${fmt(summary.loans_disbursed)}`],
                    ['Total Loan Portfolio Outstanding', `₦${fmt(summary.total_loan_outstanding)}`],
                    ['Total Savings Balance', `₦${fmt(summary.total_savings_balance)}`],
                    ['Active Loans', String(summary.active_loans)],
                    ['Defaulted Loans', String(summary.defaulted_loans)],
                    ['New Clients (period)', String(summary.new_clients)],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="py-2.5 text-gray-700">{label}</td>
                      <td className="py-2.5 text-right font-mono font-medium text-gray-900">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
