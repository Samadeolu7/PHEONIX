/**
 * Depreciation Run Page
 *
 * Allows a finance manager to trigger batch depreciation for all active assets
 * in a chosen period.  Results are shown inline with per-asset status rows.
 *
 * Route: /assets/depreciation/run
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssetCategories, useRunDepreciationBatch } from '../../hooks/useAssets';
import type { BatchDepreciationResponse, BatchDepreciationResultItem } from '../../types/assets';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, PlayCircle, CheckCircle, XCircle, MinusCircle, BarChart2 } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const statusBadge = (item: BatchDepreciationResultItem) => {
  if (item.status === 'created')
    return <Badge className="bg-green-100 text-green-800">Created</Badge>;
  if (item.status === 'skipped')
    return <Badge className="bg-gray-100 text-gray-600">Skipped</Badge>;
  return <Badge className="bg-red-100 text-red-800">Error</Badge>;
};

const StatusIcon: React.FC<{ status: BatchDepreciationResultItem['status'] }> = ({ status }) => {
  if (status === 'created') return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === 'skipped') return <MinusCircle className="h-4 w-4 text-gray-400 shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
};

// ── component ────────────────────────────────────────────────────────────────

const DepreciationRunPage: React.FC = () => {
  const [periodDate, setPeriodDate] = useState(today());
  const [autoPost, setAutoPost] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [result, setResult] = useState<BatchDepreciationResponse | null>(null);

  const { data: categories = [] } = useAssetCategories();
  const batchMutation = useRunDepreciationBatch();

  const handleRun = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResult(null);
    try {
      const res = await batchMutation.mutateAsync({
        period_date: periodDate,
        post: autoPost,
        category_id: categoryId ? parseInt(categoryId) : undefined,
      });
      setResult(res);
    } catch {
      // errors are shown via mutation error state
    }
  };

  const isBusy = batchMutation.isPending;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/assets">
          <button
            type="button"
            aria-label="Back to assets"
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Depreciation Run</h1>
          <p className="text-sm text-gray-500">
            Generate depreciation entries for all active assets in the selected period
          </p>
        </div>
      </div>

      {/* Parameters Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4 text-blue-500" />
            Run Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRun} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Period Date */}
              <div>
                <label
                  htmlFor="depn-period-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Period Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="depn-period-date"
                  type="date"
                  value={periodDate}
                  onChange={e => setPeriodDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Depreciation is calculated for the month/year that contains this date.
                </p>
              </div>

              {/* Category filter */}
              <div>
                <label
                  htmlFor="depn-category"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Category (optional)
                </label>
                <select
                  id="depn-category"
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— All categories —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Auto-post toggle */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <input
                id="depn-autopost"
                type="checkbox"
                checked={autoPost}
                onChange={e => setAutoPost(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <label
                  htmlFor="depn-autopost"
                  className="text-sm font-medium text-gray-800 cursor-pointer"
                >
                  Auto-post entries to the General Ledger
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, each depreciation entry will be immediately posted. This cannot be
                  undone without a manual journal reversal. Leave unchecked to review entries before
                  posting.
                </p>
              </div>
            </div>

            {/* Error message */}
            {batchMutation.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Failed to run depreciation batch. Please try again.
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={isBusy}>
                <PlayCircle className="h-4 w-4 mr-2" />
                {isBusy ? 'Running…' : 'Run Depreciation'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{result.total}</p>
                <p className="text-xs text-gray-500 mt-1">Assets Processed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-600">{result.succeeded}</p>
                <p className="text-xs text-gray-500 mt-1">Entries Created</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-gray-500">{result.skipped}</p>
                <p className="text-xs text-gray-500 mt-1">Skipped</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-600">{result.failed}</p>
                <p className="text-xs text-gray-500 mt-1">Failed</p>
              </CardContent>
            </Card>
          </div>

          {/* Detail table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Result Detail — Period {result.period_date}
                {result.auto_posted && (
                  <span className="ml-2 text-xs font-normal text-green-600">
                    (auto-posted to GL)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="pb-2 pr-4 w-6"></th>
                      <th className="pb-2 pr-4">Asset</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.results.map(item => (
                      <tr key={item.asset_id} className="hover:bg-gray-50">
                        <td className="py-2 pr-4">
                          <StatusIcon status={item.status} />
                        </td>
                        <td className="py-2 pr-4">
                          <div className="font-medium text-gray-900">{item.asset_name}</div>
                          <div className="text-xs text-gray-400">{item.asset_number}</div>
                        </td>
                        <td className="py-2 pr-4">{statusBadge(item)}</td>
                        <td className="py-2 pr-4">
                          {item.depreciation_amount != null ? (
                            <span className="font-mono text-gray-800">
                              {parseFloat(item.depreciation_amount).toLocaleString('en-NG', {
                                style: 'currency',
                                currency: 'NGN',
                              })}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 text-xs text-gray-500">
                          {item.reason ?? item.error ?? (item.auto_posted ? 'Posted to GL' : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default DepreciationRunPage;
