/**
 * Fixed Asset Register List Page
 * Displays all assets with filtering, search, statistics
 * Supports acquisition, movement tracking, verification
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useFixedAssets,
  useAssetCategories,
  useAssetStatistics,
  useDeleteFixedAsset,
} from '../../hooks/useAssets';
import type { AssetStatus, AssetFilters } from '../../types/assets';

import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

import { Button } from '@/components/ui/Button';

import { Input } from '@/components/ui/Input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

import {
  Package,
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  Trash2,
  MapPin,
  Gauge,
  ShoppingCart,
} from 'lucide-react';

const AssetListPage: React.FC = () => {
  const [filters, setFilters] = useState<AssetFilters>({
    search: '',
    status: undefined,
    category: undefined,
    ordering: '-created_at',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<'20' | '50' | '100' | 'all'>('20');
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const fetchAll = pageSize === 'all';
  const queryFilters = useMemo<AssetFilters>(() => {
    const base: AssetFilters = {
      ...filters,
      page: fetchAll ? undefined : page,
      page_size: fetchAll ? 100 : Number(pageSize),
    };
    return base;
  }, [fetchAll, filters, page, pageSize]);

  const { data: assetsResponse, isLoading: loadingAssets } = useFixedAssets(queryFilters, {
    fetchAll,
  });
  const { data: categories = [] } = useAssetCategories();
  const { data: stats } = useAssetStatistics();
  const deleteMutation = useDeleteFixedAsset();

  const assets = assetsResponse?.results || [];
  const totalAssets = assetsResponse?.count ?? 0;
  const totalPages = fetchAll ? 1 : Math.max(1, Math.ceil(totalAssets / Number(pageSize)));
  const hasPreviousPage = !fetchAll && page > 1;
  const hasNextPage = !fetchAll && page < totalPages;
  const pageStart = totalAssets === 0 ? 0 : (page - 1) * Number(pageSize) + 1;
  const pageEnd = fetchAll ? assets.length : Math.min(page * Number(pageSize), totalAssets);

  // When the incomplete tab is active, filter client-side to skeleton assets
  const displayAssets = incompleteOnly
    ? assets.filter(
        a =>
          !a.serial_number &&
          !a.registration_number &&
          !a.make &&
          a.status !== 'disposed' &&
          a.status !== 'sold'
      )
    : assets;

  const handleSearch = (value: string) => {
    setPage(1);
    setFilters(prev => ({ ...prev, search: value }));
  };

  const handleStatusFilter = (value: string) => {
    setPage(1);
    setFilters(prev => ({
      ...prev,
      status: value === 'all' ? undefined : (value as AssetStatus),
    }));
  };

  const handleCategoryFilter = (value: string) => {
    setPage(1);
    setFilters(prev => ({
      ...prev,
      category: value === 'all' ? undefined : parseInt(value),
    }));
  };

  const handlePageSizeChange = (value: string) => {
    setPage(1);
    setPageSize(value as typeof pageSize);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    await deleteMutation.mutateAsync(id);
  };

  const getStatusBadge = (status: AssetStatus) => {
    const variants: Record<AssetStatus, string> = {
      draft: 'bg-gray-100 text-gray-600',
      active: 'bg-green-100 text-green-800',
      idle: 'bg-yellow-100 text-yellow-800',
      maintenance: 'bg-blue-100 text-blue-800',
      disposed: 'bg-gray-100 text-gray-800',
      sold: 'bg-purple-100 text-purple-800',
    };

    const labels: Record<AssetStatus, string> = {
      draft: 'Draft',
      active: 'Active',
      idle: 'Idle',
      maintenance: 'Maintenance',
      disposed: 'Disposed',
      sold: 'Sold',
    };

    return <Badge className={variants[status]}>{labels[status]}</Badge>;
  };

  const formatCurrency = (value: string | number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value) : value);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fixed Asset Register</h1>
          <p className="text-gray-600 mt-1">
            Track and manage school assets throughout their lifecycle
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export FAR
          </Button>
          <Link to="/assets/fuel-monitor">
            <Button variant="outline">
              <Gauge className="h-4 w-4 mr-2" />
              Fuel Monitor
            </Button>
          </Link>
          <Link to="/assets/purchases/new">
            <Button variant="outline">
              <ShoppingCart className="h-4 w-4 mr-2" />
              New Purchase
            </Button>
          </Link>
          <Link to="/assets/register">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Register Asset
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_assets}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.total_value)}</div>
              <p className="text-xs text-gray-500 mt-1">Current book value</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Purchase Price</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.total_purchase_price)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Accumulated Depreciation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats.total_accumulated_depreciation)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Status Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {(
          [
            { key: undefined, label: 'All Assets' },
            { key: 'draft', label: '📋 Draft' },
            { key: 'active', label: '✓ Active' },
            { key: 'maintenance', label: '🔧 Maintenance' },
            { key: 'idle', label: '⏸ Idle' },
            { key: 'disposed', label: '🗑 Disposed' },
            { key: 'sold', label: '💲 Sold' },
          ] as { key: AssetStatus | undefined; label: string }[]
        ).map(tab => (
          <button
            key={tab.key ?? 'all'}
            onClick={() => {
              setPage(1);
              setFilters(prev => ({ ...prev, status: tab.key }));
              setIncompleteOnly(false);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              filters.status === tab.key && !incompleteOnly
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => {
            setPage(1);
            setIncompleteOnly(v => !v);
            setFilters(prev => ({ ...prev, status: undefined }));
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            incompleteOnly
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ⚠ Incomplete Details
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search assets (number, name, serial)..."
                  value={filters.search}
                  onChange={e => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Select onValueChange={handleStatusFilter} defaultValue="all">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div>
              <Select onValueChange={handleCategoryFilter} defaultValue="all">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Show per page + category badge row */}
          <div className="flex items-center gap-4 mt-4">
            <span className="text-sm text-gray-500">Show per page:</span>
            <div className="flex gap-1">
              {(['20', '50', '100', 'all'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={`px-3 py-1 text-sm rounded border transition-colors ${
                    pageSize === size
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {size === 'all' ? 'All' : size}
                </button>
              ))}
            </div>
            {filters.category && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-500">Category:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  {categories.find(c => c.id === filters.category)?.name ?? `#${filters.category}`}
                  <button
                    onClick={() => handleCategoryFilter('all')}
                    className="ml-1 hover:text-blue-900"
                    aria-label="Clear category filter"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Asset List */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Register</CardTitle>
          <CardDescription>
            {loadingAssets
              ? 'Loading…'
              : fetchAll
                ? `${displayAssets.length} of ${totalAssets} assets`
                : `${pageStart}–${pageEnd} of ${totalAssets} assets${
                    incompleteOnly ? ` (${displayAssets.length} shown after client filter)` : ''
                  }`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAssets ? (
            <div className="text-center py-8 text-gray-500">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No assets found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by registering your first asset.
              </p>
              <div className="mt-6">
                <Link to="/assets/register">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Register Asset
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Asset Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Book Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayAssets.map(asset => (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                          {asset.asset_number}
                          {asset.status === 'draft' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                              📋 Not yet acquired
                            </span>
                          )}
                          {asset.status !== 'draft' &&
                            !asset.serial_number &&
                            !asset.registration_number &&
                            !asset.make &&
                            asset.status !== 'disposed' &&
                            asset.status !== 'sold' && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700"
                                title="Asset details incomplete — edit to add serial number, plate number, and make/model"
                              >
                                ⚠ Incomplete
                              </span>
                            )}
                        </div>
                        {asset.serial_number && (
                          <div className="text-xs text-gray-500">SN: {asset.serial_number}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{asset.name}</div>
                        {asset.make && asset.model && (
                          <div className="text-xs text-gray-500">
                            {asset.make} {asset.model}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {asset.category_name || asset.category_details?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-900">
                          <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                          {asset.current_location || 'Not set'}
                        </div>
                        {asset.assigned_to && (
                          <div className="text-xs text-gray-500 ml-5">
                            Assigned: {asset.assigned_to}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {asset.status === 'draft' ? (
                          <div className="text-sm text-gray-400 italic">Not yet priced</div>
                        ) : (
                          <>
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(asset.current_value)}
                            </div>
                            <div className="text-xs text-gray-500">
                              of {formatCurrency(asset.purchase_price ?? 0)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(asset.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <Link to={`/assets/${asset.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link to={`/assets/${asset.id}/edit`}>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(asset.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls */}
          {!fetchAll && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!hasPreviousPage || loadingAssets}
                >
                  ← Previous
                </Button>

                {/* Page number buttons — show up to 5 around current page */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '…' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-gray-400 text-sm select-none"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`px-3 py-1 text-sm rounded border transition-colors ${
                          page === item
                            ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={!hasNextPage || loadingAssets}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetListPage;
