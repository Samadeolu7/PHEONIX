import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, Plus } from 'lucide-react';
import { useBorrowings } from '../../hooks/useBankBorrowings';
import { useAuth } from '../../contexts/AuthContext';
import { STATUS_LABELS, STATUS_STYLES, formatDay, naira } from './treasuryFormat';

const BorrowingListPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDirectorPlus } = useAuth();
  const { data: borrowings = [], isLoading, error } = useBorrowings();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Landmark className="w-8 h-8 text-blue-600" /> Bank Borrowings
          </h1>
          <p className="text-gray-600 mt-1">
            Loans taken from banks: the repayment schedule, each branch&apos;s share, and what to send before every
            instalment.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/treasury/liquidity" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700">
            Branch cash forecast
          </Link>
          {isDirectorPlus && <button
            type="button"
            onClick={() => navigate('/treasury/borrowings/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" /> New borrowing
          </button>}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          Could not load borrowings. Only directors can view this page.
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Lender</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Rate / month</th>
              <th className="px-4 py-3">Paid from</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Next due</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!isLoading && borrowings.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No bank borrowings yet.</td></tr>
            )}
            {borrowings.map((b) => (
              <tr key={b.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/treasury/borrowings/${b.id}`} className="text-blue-700 font-medium hover:underline">
                    {b.lender_name}
                  </Link>
                  {b.reference && <span className="text-gray-500"> · {b.reference}</span>}
                </td>
                <td className="px-4 py-3 text-right">{naira(b.principal)}</td>
                <td className="px-4 py-3 text-right">{Number(b.monthly_rate)}%</td>
                <td className="px-4 py-3">{b.debit_branch_name}</td>
                <td className="px-4 py-3">{b.paid_instalments} / {b.tenor_months}</td>
                <td className="px-4 py-3">{b.status === 'active' ? formatDay(b.next_due_date) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[b.status]}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BorrowingListPage;
