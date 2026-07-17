import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileSearch, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldAlert, ClipboardList } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { branchService, Branch } from '../../services/branchService';
import type { DailyReconciliation } from '../../types/banks';

const STATUS_STYLES: Record<DailyReconciliation['status'], string> = {
  processing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<DailyReconciliation['status'], string> = {
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

const ReconciliationListPage: React.FC = () => {
  const navigate = useNavigate();
  const [reconciliations, setReconciliations] = useState<DailyReconciliation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | DailyReconciliation['status']>('all');
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    // Only a director sees more than their own single branch here — the
    // backend already scopes DailyReconciliation.objects.for_user()
    // accordingly, this just decides whether the filter dropdown is useful.
    branchService.listBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    loadReconciliations();
  }, [statusFilter, branchFilter]);

  const loadReconciliations = async () => {
    try {
      setLoading(true);
      const data = await reconciliationService.listReconciliations({
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(branchFilter !== 'all' && { branch: branchFilter }),
      });
      setReconciliations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliations');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Statement Reconciliation</h1>
          <p className="text-gray-600 mt-1">
            Upload bank statements to auto-match transactions against ERP records
          </p>
        </div>
        <button
          onClick={() => navigate('/banks/reconciliations/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          New Reconciliation
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => navigate('/banks/reconciliations/missing-money-summary')}
          className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Missing Money Summary
        </button>
        <button
          onClick={() => navigate('/banks/reconciliations/officer-risk-report')}
          className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Officer Reconciliation Risk
        </button>
        <button
          onClick={() => navigate('/banks/reconciliations/manual-overrides')}
          className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <ClipboardList className="w-4 h-4 text-blue-500" />
          Manual Overrides Report
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(['all', 'processing', 'completed', 'failed'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize ${
                statusFilter === key ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
        {branches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank Account
                </th>
                {branches.length > 1 && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Branch
                  </th>
                )}
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matched
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank Only
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ERP Only
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uploaded By
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reconciliations.map((recon) => (
                <tr
                  key={recon.id}
                  onClick={() => navigate(`/banks/reconciliations/${recon.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {recon.reconciliation_date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {recon.bank_account_info?.account_name || '—'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {recon.bank_account_info?.account_number}
                    </div>
                  </td>
                  {branches.length > 1 && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {recon.branch_name || '—'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="inline-flex items-center gap-1 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      {recon.matched_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="inline-flex items-center gap-1 text-sm text-red-700">
                      <XCircle className="w-4 h-4" />
                      {recon.unmatched_bank_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="inline-flex items-center gap-1 text-sm text-amber-700">
                      <Clock className="w-4 h-4" />
                      {recon.unmatched_erp_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_STYLES[recon.status]}`}
                    >
                      {STATUS_LABELS[recon.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {recon.uploaded_by_name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {reconciliations.length === 0 && (
            <div className="text-center py-12">
              <FileSearch className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No reconciliations yet</h3>
              <p className="text-gray-600 mb-4">
                Upload a bank statement to get started with automatic matching
              </p>
              <button
                onClick={() => navigate('/banks/reconciliations/new')}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                New Reconciliation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReconciliationListPage;
