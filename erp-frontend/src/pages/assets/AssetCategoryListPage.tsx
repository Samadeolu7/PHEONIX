/**
 * Asset Category List Page
 *
 * Lists all fixed-asset categories and shows the four GL account mappings
 * required before depreciation can be posted.
 *
 * Route: /assets/categories
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssetCategories, useDeleteAssetCategory } from '../../hooks/useAssets';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, Edit, Trash2, Tag, BookOpen, AlertCircle, CheckCircle } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  straight_line: 'Straight Line',
  declining_balance: 'Declining Balance',
  units_of_production: 'Units of Production',
};

const glComplete = (cat: {
  asset_account: number;
  depreciation_account: number;
  accumulated_depreciation_account: number;
}): boolean =>
  Boolean(cat.asset_account && cat.depreciation_account && cat.accumulated_depreciation_account);

// ── component ────────────────────────────────────────────────────────────────

const AssetCategoryListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useAssetCategories(search ? { search } : undefined);
  const deleteMutation = useDeleteAssetCategory();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  const handleDelete = async () => {
    if (pendingDeleteId == null) return;
    try {
      await deleteMutation.mutateAsync(pendingDeleteId);
      showToast('Category deleted successfully.');
    } catch {
      showToast('Failed to delete category.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const completedCount = categories.filter(glComplete).length;
  const incompleteCount = categories.length - completedCount;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
          {toastMsg}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {pendingDeleteId != null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Category</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete the category. Assets already assigned to this category
              will lose their category reference.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Categories</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage GL account mappings required for depreciation posting
          </p>
        </div>
        <Link to="/assets/categories/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Category
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Tag className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-gray-500">Total Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-xs text-gray-500">GL Complete</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{incompleteCount}</p>
                <p className="text-xs text-gray-500">Missing GL Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading categories…</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No categories found.</p>
              <Link to="/assets/categories/create">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Category
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Assets</th>
                    <th className="pb-3 pr-4">Default Method</th>
                    <th className="pb-3 pr-4">Useful Life</th>
                    <th className="pb-3 pr-4">Asset Account</th>
                    <th className="pb-3 pr-4">Accum. Depr. Account</th>
                    <th className="pb-3 pr-4">Depr. Expense Account</th>
                    <th className="pb-3 pr-4">Maintenance Account</th>
                    <th className="pb-3">GL Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categories.map(cat => {
                    const complete = glComplete(cat);
                    return (
                      <tr key={cat.id} className="hover:bg-gray-50">
                        {/* Name + Code */}
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-900">{cat.name}</div>
                          <div className="text-xs text-gray-400">{cat.code}</div>
                          {cat.description && (
                            <div className="text-xs text-gray-400 truncate max-w-[160px]">
                              {cat.description}
                            </div>
                          )}
                        </td>

                        {/* Asset Count */}
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center justify-center min-w-[2rem] h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                            {cat.asset_count ?? 0}
                          </span>
                        </td>

                        {/* Default Depreciation Method */}
                        <td className="py-3 pr-4 text-gray-700">
                          {METHOD_LABELS[cat.default_depreciation_method] ??
                            cat.default_depreciation_method}
                        </td>

                        {/* Useful Life */}
                        <td className="py-3 pr-4 text-gray-700">
                          {cat.default_useful_life_years} yr
                          {cat.default_useful_life_years !== 1 ? 's' : ''}
                        </td>

                        {/* Asset Account */}
                        <td className="py-3 pr-4">
                          {cat.asset_account_name ? (
                            <span className="text-gray-800">{cat.asset_account_name}</span>
                          ) : (
                            <span className="text-red-400 text-xs italic">Not set</span>
                          )}
                        </td>

                        {/* Accumulated Depreciation Account */}
                        <td className="py-3 pr-4">
                          {cat.accumulated_depreciation_account_name ? (
                            <span className="text-gray-800">
                              {cat.accumulated_depreciation_account_name}
                            </span>
                          ) : (
                            <span className="text-red-400 text-xs italic">Not set</span>
                          )}
                        </td>

                        {/* Depreciation Expense Account */}
                        <td className="py-3 pr-4">
                          {cat.depreciation_account_name ? (
                            <span className="text-gray-800">{cat.depreciation_account_name}</span>
                          ) : (
                            <span className="text-red-400 text-xs italic">Not set</span>
                          )}
                        </td>

                        {/* Maintenance Account */}
                        <td className="py-3 pr-4">
                          {cat.maintenance_expense_account_name ? (
                            <span className="text-gray-800">
                              {cat.maintenance_expense_account_name}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs italic">—</span>
                          )}
                        </td>

                        {/* GL Status */}
                        <td className="py-3 pr-4">
                          {complete ? (
                            <Badge className="bg-green-100 text-green-800">Complete</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Incomplete</Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/assets/categories/${cat.id}/edit`}>
                              <button
                                title="Edit"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            </Link>
                            <button
                              title="Delete"
                              onClick={() => setPendingDeleteId(cat.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetCategoryListPage;
