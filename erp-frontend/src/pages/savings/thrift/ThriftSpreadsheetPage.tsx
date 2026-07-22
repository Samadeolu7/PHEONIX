import React, { useEffect, useState } from 'react';
import { Calendar, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../../../services/api';
import { useSavingsCollections } from '../../../hooks/useSavings';
import type { ContributionScheduleItem } from '../../../services/savingsService';

interface Product { id: number; name: string; code: string; }
interface DayMap { [accountId: number]: Set<number> }

function toISO(d: Date) { return d.toISOString().split('T')[0]; }

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1);
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function ThriftSpreadsheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [productId, setProductId] = useState<number | ''>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState('');
  const [clients, setClients] = useState<{ id: number; name: string; amount: string }[]>([]);
  const [dayMap, setDayMap] = useState<DayMap>({});
  const [generated, setGenerated] = useState(false);

  // Track collection data per day for spreadsheet generation
  const [dayData, setDayData] = useState<Record<string, ContributionScheduleItem[]>>({});
  const [loadingDays, setLoadingDays] = useState(false);

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

  async function generate() {
    if (!productId) return;
    setLoadingDays(true);
    setError('');
    setGenerated(false);
    try {
      const days = getDaysInMonth(year, month);
      const allItems: (ContributionScheduleItem & { _day: number })[] = [];

      for (const day of days) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        try {
          const res = await api.get('/savings/collections/', { params: { date: dateStr, product: productId } });
          const dayItems: ContributionScheduleItem[] = Array.isArray(res) ? res : ((res as any)?.results ?? []);
          for (const item of dayItems) {
            if (item.status === 'paid') allItems.push({ ...item, _day: day });
          }
        } catch {
          // skip failed days
        }
      }

      const clientMap: Record<number, { id: number; name: string; amount: string }> = {};
      const dm: DayMap = {};
      for (const item of allItems) {
        if (!clientMap[item.savings_account]) {
          clientMap[item.savings_account] = { id: item.savings_account, name: item.client_name, amount: item.expected_amount };
          dm[item.savings_account] = new Set();
        }
        dm[item.savings_account].add(item._day);
      }
      setClients(Object.values(clientMap));
      setDayMap(dm);
      setGenerated(true);
    } catch {
      setError('Failed to load contribution data.');
    } finally {
      setLoadingDays(false);
    }
  }

  const days = getDaysInMonth(year, month);
  const selectedProduct = products.find(p => p.id === productId);

  function exportCSV() {
    const header = ['Client', 'Daily Amount', ...days.map(d => String(d))].join(',');
    const rows = clients.map(c =>
      [c.name, c.amount, ...days.map(d => (dayMap[c.id]?.has(d) ? '1' : ''))].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contributions-${selectedProduct?.code ?? 'all'}-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contribution Spreadsheet</h1>
            <p className="text-sm text-gray-500 mt-1">Monthly grid of paid contribution days per client, by product</p>
          </div>
          {generated && (
            <button
              type="button"
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="sp-product" className="block text-xs font-medium text-gray-600 mb-1">Product</label>
            {loadingProducts ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <select
                id="sp-product"
                value={productId}
                onChange={e => { setProductId(e.target.value ? Number(e.target.value) : ''); setGenerated(false); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">— Select a product —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="sp-year" className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <input
              id="sp-year"
              type="number"
              value={year}
              onChange={e => { setYear(Number(e.target.value)); setGenerated(false); }}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              min={2020} max={2030}
            />
          </div>
          <div>
            <label htmlFor="sp-month" className="block text-xs font-medium text-gray-600 mb-1">Month</label>
            <select
              id="sp-month"
              value={month}
              onChange={e => { setMonth(Number(e.target.value)); setGenerated(false); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loadingDays || !productId}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingDays ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Generate
          </button>
        </div>

        {loadingDays && (
          <div className="flex flex-col items-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">Loading {days.length} days of contributions…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {generated && !loadingDays && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            {clients.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No paid contributions for {selectedProduct?.name} in {year}-{String(month).padStart(2, '0')}.</p>
              </div>
            ) : (
              <table className="text-xs whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50">Client</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Daily Amt</th>
                    {days.map(d => (
                      <th key={d} className="px-2 py-2 text-center font-semibold text-gray-600 w-7">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white">{c.name}</td>
                      <td className="px-3 py-2 text-right font-mono">₦{fmt(c.amount)}</td>
                      {days.map(d => (
                        <td key={d} className="px-2 py-2 text-center">
                          {dayMap[c.id]?.has(d) && <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
