import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingDown,
  RefreshCw,
  CheckCircle,
  Clock,
  BadgeDollarSign,
  Search,
  AlertTriangle,
  Play,
} from 'lucide-react';
import {
  useAssetDepreciation,
  usePostDepreciation,
  useRunDepreciationBatch,
} from '../../hooks/useAssets';
import type { AssetDepreciation } from '../../types/assets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (v: string | number | undefined) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(v ?? 0));

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

// ─── Row ──────────────────────────────────────────────────────────────────────

const DepreciationRow: React.FC<{
  entry: AssetDepreciation;
  selected: boolean;
  onSelect: () => void;
  onPost: () => void;
  posting: boolean;
}> = ({ entry, selected, onSelect, onPost, posting }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-4 py-3">
      {!entry.is_posted && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="rounded border-gray-300 text-blue-600"
        />
      )}
    </td>
    <td className="px-4 py-3 text-sm font-medium text-blue-600">
      {entry.asset_number || `Asset #${entry.asset}`}
    </td>
    <td className="px-4 py-3 text-sm text-gray-700">{entry.asset_name || '—'}</td>
    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.period_start)}</td>
    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.period_end)}</td>
    <td className="px-4 py-3 text-sm font-medium text-gray-800">
      {formatCurrency(entry.depreciation_amount)}
    </td>
    <td className="px-4 py-3 text-sm">
      {entry.is_posted ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" /> Posted
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" /> Unposted
        </span>
      )}
    </td>
    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(entry.posted_at)}</td>
    <td className="px-4 py-3 text-sm">
      {!entry.is_posted && (
        <button
          onClick={onPost}
          disabled={posting}
          title="Post to GL"
          className="p-1.5 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
        >
          <BadgeDollarSign className="w-4 h-4" />
        </button>
      )}
    </td>
  </tr>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabKey = 'all' | 'unposted' | 'posted';

const AssetDepreciationListPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchPosting, setBatchPosting] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);

  const filters = {
    is_posted: tab === 'unposted' ? false : tab === 'posted' ? true : undefined,
    search: search || undefined,
  };

  const { data, isLoading, refetch } = useAssetDepreciation(filters);
  const postMutation = usePostDepreciation();
  const batchMutation = useRunDepreciationBatch();

  const entries: AssetDepreciation[] = data?.results ?? [];

  const unpostedCount = entries.filter(e => !e.is_posted).length;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const unposted = entries.filter(e => !e.is_posted).map(e => e.id);
    if (selected.size === unposted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unposted));
    }
  };

  const handlePost = async (id: number) => {
    await postMutation.mutateAsync(id);
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBatchPost = async () => {
    setBatchPosting(true);
    try {
      for (const id of Array.from(selected)) {
        await postMutation.mutateAsync(id);
      }
      setSelected(new Set());
    } finally {
      setBatchPosting(false);
    }
  };

  const handleRunBatch = async () => {
    await batchMutation.mutateAsync({});
    setShowRunModal(false);
    refetch();
  };

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All Entries' },
    { key: 'unposted', label: 'Unposted', count: unpostedCount },
    { key: 'posted', label: 'Posted' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-indigo-600" />
            Depreciation Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and post depreciation entries across all assets.
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
            onClick={() => setShowRunModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
          >
            <Play className="w-4 h-4" />
            Run Depreciation
          </button>
          <button
            onClick={() => navigate('/assets/depreciation-run')}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 font-medium text-sm"
          >
            Advanced Run
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
                ? 'border-indigo-600 text-indigo-600'
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

      {/* Filters + Bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by asset number or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {selected.size > 0 && (
          <button
            onClick={handleBatchPost}
            disabled={batchPosting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-60"
          >
            <BadgeDollarSign className="w-4 h-4" />
            {batchPosting ? 'Posting…' : `Post ${selected.size} Selected`}
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No depreciation entries found</p>
          <button
            onClick={() => setShowRunModal(true)}
            className="mt-3 text-sm text-indigo-600 hover:underline"
          >
            Run depreciation to generate entries
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={
                        entries.filter(e => !e.is_posted).length > 0 &&
                        selected.size === entries.filter(e => !e.is_posted).length
                      }
                      className="rounded border-gray-300 text-indigo-600"
                    />
                  </th>
                  {[
                    'Asset No.',
                    'Asset Name',
                    'Period Start',
                    'Period End',
                    'Amount',
                    'Status',
                    'Posted On',
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
                {entries.map(entry => (
                  <DepreciationRow
                    key={entry.id}
                    entry={entry}
                    selected={selected.has(entry.id)}
                    onSelect={() => toggleSelect(entry.id)}
                    onPost={() => handlePost(entry.id)}
                    posting={postMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </div>
        </div>
      )}

      {/* Run depreciation modal */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <Play className="w-6 h-6 text-indigo-600" />
              <h3 className="text-lg font-semibold">Run Depreciation</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              This will calculate and create depreciation entries for all active assets for the
              current period. Existing unposted entries will not be duplicated.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRunModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRunBatch}
                disabled={batchMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {batchMutation.isPending ? 'Running…' : 'Run Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDepreciationListPage;
