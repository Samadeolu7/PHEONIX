// src/pages/inventory/StockReorderPage.tsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package, Search, ShoppingCart } from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';

const fmt = (v: string | undefined) =>
  v
    ? parseFloat(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const StockReorderPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => setDebouncedSearch(value), 400));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-low-stock', debouncedSearch],
    queryFn: () =>
      inventoryService.getLowStockItems({
        search: debouncedSearch || undefined,
        page_size: 100,
      }),
    staleTime: 60_000,
  });

  const reorderItems = data?.results ?? [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={22} />
            Stock Reorder Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Items whose current stock has fallen at or below the reorder level
          </p>
        </div>
        {!isLoading && (
          <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-sm font-medium">
            {data?.count ?? reorderItems.length} item
            {(data?.count ?? reorderItems.length) !== 1 ? 's' : ''} need reorder
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          title="Search items"
          placeholder="Search item, SKU, category…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-14 text-gray-400 text-sm">Loading…</div>
        ) : reorderItems.length === 0 ? (
          <div className="text-center py-16">
            <Package size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">
              {search ? 'No matching items' : 'No reorder alerts — all stock levels are healthy!'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-amber-800">Item</th>
                  <th className="text-left px-4 py-3 font-semibold text-amber-800">SKU</th>
                  <th className="text-left px-4 py-3 font-semibold text-amber-800">Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-amber-800">
                    Current Stock
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-amber-800">
                    Reorder Level
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-amber-800">Reorder Qty</th>
                  <th className="text-right px-4 py-3 font-semibold text-amber-800">Shortfall</th>
                  <th className="text-left px-4 py-3 font-semibold text-amber-800">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reorderItems.map(item => {
                  const currentStock = parseFloat(item.total_stock);
                  const reorderLevel = parseFloat(item.reorder_level ?? '0');
                  const reorderQty = parseFloat(item.reorder_quantity ?? '0');
                  const shortfall = Math.max(0, reorderLevel - currentStock + reorderQty);

                  return (
                    <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">
                            {item.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.sku}</td>
                      <td className="px-4 py-3 text-gray-600">{item.category_name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-red-600">{fmt(item.total_stock)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {fmt(item.reorder_level)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {reorderQty > 0 ? fmt(item.reorder_quantity) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {shortfall > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {shortfall.toLocaleString('en-NG', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {item.unit_of_measure ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        {!isLoading && reorderItems.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
            <ShoppingCart size={14} />
            <span>
              {reorderItems.length} item{reorderItems.length !== 1 ? 's' : ''} require restocking.
              Create a Purchase Order from the Procurement module to reorder.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockReorderPage;
