import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import {
  getSavingsCollectionSheet,
  markContributionPaid,
  type ContributionScheduleItem,
} from '../../../services/savingsService';

interface Product {
  id: number;
  name: string;
  code: string;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function ThriftCollectionPage() {
  const today = toISO(new Date());
  const [date, setDate] = useState(today);
  const [productId, setProductId] = useState<number | ''>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<ContributionScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get('/products/products/', { params: { product_type: 'SAVINGS', is_active: true, page_size: 200 } })
      .then((res: any) => {
        const list: Product[] = Array.isArray(res) ? res : (res.results ?? []);
        setProducts(list);
        if (list.length === 1) setProductId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  async function load() {
    if (!productId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSavingsCollectionSheet({ date, product: productId as number });
      setItems(data);
    } catch {
      setError('Failed to load collection sheet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (productId) load();
    else setItems([]);
  }, [date, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMark(item: ContributionScheduleItem) {
    setMarking(prev => new Set(prev).add(item.id));
    try {
      await markContributionPaid(item.id);
      setItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, status: 'paid' as const } : i))
      );
    } catch {
      setError(`Failed to mark payment for ${item.client_name}.`);
    } finally {
      setMarking(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }

  const pending = items.filter(i => i.status === 'pending');
  const paid = items.filter(i => i.status === 'paid');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Savings Collection Sheet</h1>
            <p className="text-sm text-gray-500 mt-1">Record contribution payments for a savings product</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading || !productId}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="col-product" className="block text-xs font-medium text-gray-600 mb-1">Product</label>
            {loadingProducts ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <select
                id="col-product"
                value={productId}
                onChange={e => setProductId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select a product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="col-date" className="block text-xs font-medium text-gray-600 mb-1">Collection Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                id="col-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {productId && (
            <div className="ml-auto flex gap-4 text-sm self-center">
              <span className="text-gray-500">Pending: <strong className="text-orange-600">{pending.length}</strong></span>
              <span className="text-gray-500">Paid: <strong className="text-green-600">{paid.length}</strong></span>
              <span className="text-gray-500">Total: <strong>{items.length}</strong></span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {!productId && !loadingProducts && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            Select a savings product to load the collection sheet.
          </div>
        )}

        {productId && (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {items.length === 0 ? (
                <div className="p-10 text-center text-gray-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p>No contribution entries for this product on the selected date.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Account</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Amount Due</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={item.id} className={item.status === 'paid' ? 'bg-green-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.client_name}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{item.account_number}</td>
                        <td className="px-4 py-3 text-right font-mono">₦{fmt(item.expected_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {item.status === 'paid' ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleMark(item)}
                              disabled={marking.has(item.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {marking.has(item.id) ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
