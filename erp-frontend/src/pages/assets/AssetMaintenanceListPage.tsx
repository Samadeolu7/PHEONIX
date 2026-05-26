import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Wrench,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Trash2,
  AlertTriangle,
  CalendarClock,
  BadgeDollarSign,
} from 'lucide-react';
import {
  useAssetMaintenance,
  usePostMaintenance,
  useDeleteMaintenance,
} from '../../hooks/useAssets';
import type { AssetMaintenance } from '../../types/assets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  preventive: 'Preventive',
  corrective: 'Corrective',
  inspection: 'Inspection',
  overhaul: 'Overhaul',
  emergency: 'Emergency',
};

const formatCurrency = (value: string | number | undefined) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const isUpcoming = (record: AssetMaintenance) => {
  if (!record.next_maintenance_date || record.is_posted) return false;
  const days =
    (new Date(record.next_maintenance_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days <= 30;
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ posted: boolean }> = ({ posted }) =>
  posted ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      <CheckCircle className="w-3 h-3" /> Posted
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" /> Unposted
    </span>
  );

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  record: AssetMaintenance;
  onView: () => void;
  onPost: () => void;
  onDelete: () => void;
  posting: boolean;
}

const MaintenanceRow: React.FC<RowProps> = ({ record, onView, onPost, onDelete, posting }) => {
  const upcoming = isUpcoming(record);
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-blue-600">
        <button onClick={onView} className="hover:underline">
          {record.asset_number || `Asset #${record.asset}`}
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{record.asset_name || '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {MAINTENANCE_TYPE_LABELS[record.maintenance_type] || record.maintenance_type}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.maintenance_date)}</td>
      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{formatCurrency(record.cost)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {record.next_maintenance_date ? (
          <span className={upcoming ? 'text-amber-600 font-semibold flex items-center gap-1' : ''}>
            {upcoming && <CalendarClock className="w-3 h-3" />}
            {formatDate(record.next_maintenance_date)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {record.performed_by_staff_name || record.performed_by || '—'}
      </td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge posted={record.is_posted} />
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onView}
            title="View"
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
          >
            <Eye className="w-4 h-4" />
          </button>
          {!record.is_posted && (
            <button
              onClick={onPost}
              disabled={posting}
              title="Post to GL"
              className="p-1.5 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
            >
              <BadgeDollarSign className="w-4 h-4" />
            </button>
          )}
          {!record.is_posted && (
            <button
              onClick={onDelete}
              title="Delete"
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabKey = 'all' | 'upcoming' | 'unposted';

const AssetMaintenanceListPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data, isLoading, refetch } = useAssetMaintenance({
    search: search || undefined,
    maintenance_type: typeFilter || undefined,
    is_posted: tab === 'unposted' ? false : undefined,
  });

  const postMutation = usePostMaintenance();
  const deleteMutation = useDeleteMaintenance();

  const allRecords: AssetMaintenance[] = data?.results ?? [];

  const records = tab === 'upcoming' ? allRecords.filter(isUpcoming) : allRecords;

  const upcomingCount = allRecords.filter(isUpcoming).length;
  const unpostedCount = allRecords.filter(r => !r.is_posted).length;

  const handlePost = async (id: number) => {
    await postMutation.mutateAsync(id);
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    setDeleteConfirm(null);
  };

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All Records' },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'unposted', label: 'Unposted', count: unpostedCount },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-600" />
            Asset Maintenance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track maintenance records, schedule and post expenses to the general ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => navigate('/assets/maintenance/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Log Maintenance
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by asset number or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="preventive">Preventive</option>
          <option value="corrective">Corrective</option>
          <option value="inspection">Inspection</option>
          <option value="overhaul">Overhaul</option>
          <option value="emergency">Emergency</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No maintenance records found</p>
          <button
            onClick={() => navigate('/assets/maintenance/new')}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Log the first one
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    'Asset No.',
                    'Asset Name',
                    'Type',
                    'Date',
                    'Cost',
                    'Next Due',
                    'Performed By',
                    'Status',
                    'Actions',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(rec => (
                  <MaintenanceRow
                    key={rec.id}
                    record={rec}
                    onView={() => navigate(`/assets/maintenance/${rec.id}`)}
                    onPost={() => handlePost(rec.id)}
                    onDelete={() => setDeleteConfirm(rec.id)}
                    posting={postMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            {records.length} record{records.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-semibold">Delete Record?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              This will permanently remove the maintenance record. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetMaintenanceListPage;
