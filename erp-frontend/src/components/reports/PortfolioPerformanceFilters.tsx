/**
 * Filter bar for the Portfolio & Performance Report (Track 2).
 *
 * Unlike financialReports/ReportFilters.tsx (date-range only, no
 * branch/product/officer awareness — that component is tightly coupled to
 * ReportType/ReportFiltersType), this is a fresh, purpose-built filter bar:
 * branch/product/officer/risk-band selects, a date range with quick presets,
 * and a "group by" checkbox row for the breakdown table/chart.
 */
import React, { useEffect, useState } from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import { branchService, Branch } from '../../services/branchService';
import { staffService, Staff } from '../../services/staffService';
import { loanService, LoanProduct } from '../../services/loanService';
import { ReportFilters, GroupByDimension } from '../../services/portfolioPerformanceService';

const RISK_BANDS = ['performing', 'watch', 'substandard', 'doubtful', 'loss'];
const GROUP_BY_OPTIONS: { key: GroupByDimension; label: string }[] = [
  { key: 'branch', label: 'Branch' },
  { key: 'product', label: 'Product' },
  { key: 'officer', label: 'Officer' },
  { key: 'risk_band', label: 'Risk Band' },
];

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function presetRange(preset: 'this_month' | 'last_month' | 'last_quarter' | 'this_year'): { start: string; end: string } {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(now) };
    case 'last_month':
      return {
        start: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'last_quarter':
      return { start: isoDate(new Date(now.getFullYear(), now.getMonth() - 3, 1)), end: isoDate(now) };
    case 'this_year':
      return { start: `${now.getFullYear()}-01-01`, end: isoDate(now) };
  }
}

interface Props {
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  groupBy: GroupByDimension[];
  onGroupByChange: (groupBy: GroupByDimension[]) => void;
}

export default function PortfolioPerformanceFilters({ filters, onFiltersChange, groupBy, onGroupByChange }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [products, setProducts] = useState<LoanProduct[]>([]);

  useEffect(() => {
    branchService.listBranches().then(setBranches).catch(() => setBranches([]));
    staffService.getAllStaff().then(setStaff).catch(() => setStaff([]));
    loanService.listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  function set<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function toggleGroupBy(key: GroupByDimension) {
    if (groupBy.includes(key)) {
      onGroupByChange(groupBy.filter((k) => k !== key));
    } else {
      onGroupByChange([...groupBy, key]);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm mb-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Start Date</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              type="date"
              value={filters.start ?? ''}
              onChange={(e) => set('start', e.target.value || undefined)}
              className="rounded-lg border border-gray-300 py-2 pl-7 pr-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">End Date</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              type="date"
              value={filters.end ?? ''}
              onChange={(e) => set('end', e.target.value || undefined)}
              className="rounded-lg border border-gray-300 py-2 pl-7 pr-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-1.5">
          {(['this_month', 'last_month', 'last_quarter', 'this_year'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onFiltersChange({ ...filters, ...presetRange(preset) })}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {preset.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Branch</label>
          <select
            value={filters.branch ?? ''}
            onChange={(e) => set('branch', e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-300 py-2 px-2 text-sm min-w-[140px]"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Product</label>
          <select
            value={filters.product ?? ''}
            onChange={(e) => set('product', e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-300 py-2 px-2 text-sm min-w-[140px]"
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.product}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Officer</label>
          <select
            value={filters.officer ?? ''}
            onChange={(e) => set('officer', e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-300 py-2 px-2 text-sm min-w-[140px]"
          >
            <option value="">All Officers</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || `${s.first_name} ${s.last_name}`}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Risk Band</label>
          <select
            value={filters.riskBand ?? ''}
            onChange={(e) => set('riskBand', e.target.value || undefined)}
            className="rounded-lg border border-gray-300 py-2 px-2 text-sm min-w-[130px]"
          >
            <option value="">All Bands</option>
            {RISK_BANDS.map((band) => (
              <option key={band} value={band} className="capitalize">{band}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => { onFiltersChange({}); onGroupByChange(GROUP_BY_OPTIONS.map((g) => g.key)); }}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Group breakdown by:</span>
        {GROUP_BY_OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={groupBy.includes(opt.key)}
              onChange={() => toggleGroupBy(opt.key)}
              className="rounded border-gray-300"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
