import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Printer,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  BarChart2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemLifecycleLedger, useItemCostAnalysis } from '../../hooks/useLedger';
import { LifecycleLedgerEntry, CostChange } from '../../types/ledger';

// ─── formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number, dp = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── constants ─────────────────────────────────────────────────────────────────

const VALUATION_COLORS: Record<string, string> = {
  average: 'bg-blue-100 text-blue-800',
  fifo: 'bg-purple-100 text-purple-800',
  lifo: 'bg-orange-100 text-orange-800',
};

const MOVEMENT_COLORS: Record<string, string> = {
  purchase: 'bg-green-100 text-green-700',
  return_in: 'bg-teal-100 text-teal-700',
  production_in: 'bg-cyan-100 text-cyan-700',
  sale: 'bg-red-100 text-red-700',
  return_out: 'bg-pink-100 text-pink-700',
  write_off: 'bg-gray-200 text-gray-700',
  production_out: 'bg-orange-100 text-orange-700',
  adjustment: 'bg-yellow-100 text-yellow-700',
  transfer: 'bg-indigo-100 text-indigo-700',
};

// ─── SummaryCard ───────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  qty: number;
  value: number;
  avgCost: number;
  uom: string;
  accent?: string;
}> = ({ label, qty, value, avgCost, uom, accent = 'border-gray-200' }) => (
  <div className={`bg-white rounded-xl border-2 ${accent} p-4 space-y-1`}>
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className="text-2xl font-bold text-gray-900">
      {fmt(qty, 0)} <span className="text-sm font-normal text-gray-500">{uom}</span>
    </p>
    <p className="text-sm text-gray-600">
      Avg cost: <span className="font-medium">{fmt(avgCost)}</span>
    </p>
    <p className="text-sm font-semibold text-gray-800">Value: {fmt(value)}</p>
  </div>
);

// ─── CostChangeBanner ──────────────────────────────────────────────────────────

const CostChangeBanner: React.FC<{ cc: CostChange }> = ({ cc }) => (
  <div
    className={`mx-2 my-1 rounded-lg border px-4 py-3 text-sm ${
      cc.direction === 'increase'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : cc.direction === 'decrease'
          ? 'border-blue-300 bg-blue-50 text-blue-900'
          : 'border-gray-200 bg-gray-50 text-gray-700'
    }`}
  >
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">
          Cost{' '}
          {cc.direction === 'increase'
            ? '\u25b2 Increased'
            : cc.direction === 'decrease'
              ? '\u25bc Decreased'
              : '\u2014 Unchanged'}
          : {fmt(cc.previous_avg_cost)} \u2192 {fmt(cc.new_avg_cost)}
          <span
            className={`ml-2 text-xs ${
              cc.direction === 'increase' ? 'text-amber-700' : 'text-blue-700'
            }`}
          >
            ({cc.direction === 'increase' ? '+' : ''}
            {fmt(cc.change_per_unit)}/unit)
          </span>
        </p>
        <p className="text-xs leading-relaxed">{cc.accounting_note}</p>
        <p className="text-xs font-medium">
          Implicit stock revaluation:{' '}
          <span className={cc.implicit_revaluation > 0 ? 'text-amber-700' : 'text-blue-700'}>
            {cc.implicit_revaluation > 0 ? '+' : ''}
            {fmt(cc.implicit_revaluation)}
          </span>{' '}
          on {fmt(cc.qty_before_receipt, 0)} units held
        </p>
      </div>
    </div>
  </div>
);

// ─── EntryRow ──────────────────────────────────────────────────────────────────

const EntryRow: React.FC<{
  entry: LifecycleLedgerEntry;
  expanded: boolean;
  onToggle: () => void;
}> = ({ entry, expanded, onToggle }) => {
  const hasMeta =
    !!entry.source?.purchase_order || !!entry.invoice || !!entry.material_request || !!entry.notes;

  return (
    <>
      {/* Cost-change banner above this row */}
      {entry.cost_changed && entry.cost_change && (
        <tr>
          <td colSpan={13} className="p-0">
            <CostChangeBanner cc={entry.cost_change} />
          </td>
        </tr>
      )}

      {/* Main movement row */}
      <tr
        className={`border-b transition-colors hover:bg-gray-50 ${
          entry.cost_changed ? 'bg-amber-50' : ''
        }`}
      >
        {/* Expand toggle */}
        <td className="px-2 py-2 text-center w-8">
          {hasMeta && (
            <button onClick={onToggle} className="text-gray-400 hover:text-gray-700">
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
        </td>

        <td className="px-3 py-2 text-xs text-gray-400 w-10">{entry.seq}</td>
        <td className="px-3 py-2 text-sm whitespace-nowrap">{fmtDate(entry.date)}</td>

        {/* Movement type badge */}
        <td className="px-3 py-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              MOVEMENT_COLORS[entry.movement_type] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {entry.movement_type_display}
          </span>
        </td>

        {/* Source document column */}
        <td className="px-3 py-2 text-xs text-gray-700 max-w-[180px]">
          {entry.source?.purchase_order ? (
            <div>
              <p className="font-medium">{entry.source.document_number}</p>
              <p className="text-gray-500">PO: {entry.source.purchase_order.po_number}</p>
              <p className="text-gray-500">{entry.source.purchase_order.supplier_name}</p>
            </div>
          ) : entry.invoice ? (
            <div>
              <p className="font-medium">{entry.invoice.invoice_number}</p>
              {entry.invoice.client && <p className="text-gray-500">{entry.invoice.client.name}</p>}
            </div>
          ) : entry.reference ? (
            <p>{entry.reference}</p>
          ) : (
            <span className="text-gray-400">\u2014</span>
          )}
        </td>

        {/* MR # */}
        <td className="px-3 py-2 text-xs">
          {entry.material_request ? (
            <div>
              <p className="font-medium text-blue-700">{entry.material_request.request_number}</p>
              <p className="text-gray-500 truncate max-w-[120px]">
                {entry.material_request.purpose}
              </p>
            </div>
          ) : (
            <span className="text-gray-300">\u2014</span>
          )}
        </td>

        {/* Qty In */}
        <td className="px-3 py-2 text-right text-sm font-medium">
          {entry.quantity_in > 0 ? (
            <span className="text-green-700">+{fmt(entry.quantity_in, 0)}</span>
          ) : (
            <span className="text-gray-300">\u2014</span>
          )}
        </td>

        {/* Qty Out */}
        <td className="px-3 py-2 text-right text-sm font-medium">
          {entry.quantity_out > 0 ? (
            <span className="text-red-600">-{fmt(entry.quantity_out, 0)}</span>
          ) : (
            <span className="text-gray-300">\u2014</span>
          )}
        </td>

        {/* Running balance */}
        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-800">
          {fmt(entry.running_qty, 0)}
        </td>

        {/* Unit cost */}
        <td className="px-3 py-2 text-right text-xs text-gray-600">{fmt(entry.unit_cost)}</td>

        {/* Running avg cost — highlighted when changed */}
        <td
          className={`px-3 py-2 text-right text-xs font-medium ${
            entry.cost_changed ? 'text-amber-700' : 'text-gray-700'
          }`}
        >
          {fmt(entry.running_avg_cost)}
          {entry.cost_changed && <span className="ml-1 text-amber-500">\u25cf</span>}
        </td>

        {/* Running stock value */}
        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
          {fmt(entry.running_value)}
        </td>

        {/* Created by */}
        <td className="px-3 py-2 text-xs text-gray-500">{entry.created_by ?? '\u2014'}</td>
      </tr>

      {/* Expanded detail drawer */}
      {expanded && hasMeta && (
        <tr className="bg-gray-50 border-b">
          <td colSpan={13} className="px-8 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {entry.source?.purchase_order && (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide">
                    Purchase Chain
                  </p>
                  <p>
                    <span className="text-gray-500">Document:</span> {entry.source.document_number}
                  </p>
                  {entry.source.received_date && (
                    <p>
                      <span className="text-gray-500">Received:</span>{' '}
                      {fmtDate(entry.source.received_date)}
                    </p>
                  )}
                  {entry.source.received_by && (
                    <p>
                      <span className="text-gray-500">Received by:</span> {entry.source.received_by}
                    </p>
                  )}
                  <p>
                    <span className="text-gray-500">PO #:</span>{' '}
                    {entry.source.purchase_order.po_number}
                  </p>
                  <p>
                    <span className="text-gray-500">PO Date:</span>{' '}
                    {fmtDate(entry.source.purchase_order.order_date)}
                  </p>
                  <p>
                    <span className="text-gray-500">Supplier:</span>{' '}
                    {entry.source.purchase_order.supplier_name}
                  </p>
                </div>
              )}

              {entry.invoice && (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide">Invoice</p>
                  <p>
                    <span className="text-gray-500">Invoice #:</span> {entry.invoice.invoice_number}
                  </p>
                  <p>
                    <span className="text-gray-500">Date:</span>{' '}
                    {fmtDate(entry.invoice.invoice_date)}
                  </p>
                  {entry.invoice.client && (
                    <>
                      <p>
                        <span className="text-gray-500">Client:</span> {entry.invoice.client.name}
                      </p>
                      <p>
                        <span className="text-gray-500">Client ID:</span>{' '}
                        {entry.invoice.client.client_id}
                      </p>
                    </>
                  )}
                </div>
              )}

              {entry.material_request && (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide">
                    Material Request
                  </p>
                  <p>
                    <span className="text-gray-500">MR #:</span>{' '}
                    {entry.material_request.request_number}
                  </p>
                  <p>
                    <span className="text-gray-500">Date:</span>{' '}
                    {fmtDate(entry.material_request.request_date)}
                  </p>
                  <p>
                    <span className="text-gray-500">Requested by:</span>{' '}
                    {entry.material_request.requested_by}
                  </p>
                  <p>
                    <span className="text-gray-500">Purpose:</span> {entry.material_request.purpose}
                  </p>
                  {entry.material_request.service_invoice_number && (
                    <p>
                      <span className="text-gray-500">Service Invoice:</span>{' '}
                      {entry.material_request.service_invoice_number}
                    </p>
                  )}
                </div>
              )}

              {(entry.notes || entry.location) && (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide">Details</p>
                  {entry.location && (
                    <p>
                      <span className="text-gray-500">Location:</span> {entry.location.name}
                    </p>
                  )}
                  {entry.notes && (
                    <p>
                      <span className="text-gray-500">Notes:</span> {entry.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── CostAnalysisPanel ─────────────────────────────────────────────────────────

const CostAnalysisPanel: React.FC<{ itemId: number }> = ({ itemId }) => {
  const [open, setOpen] = useState(false);
  const { data: ca, isLoading } = useItemCostAnalysis(itemId, open);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <BarChart2 className="w-4 h-4 text-blue-600" />
          Cost Method &amp; Accounting Explanation
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-500 animate-pulse">Loading\u2026</p>
          ) : !ca ? (
            <p className="text-sm text-gray-500">No data available.</p>
          ) : (
            <>
              {/* Current position */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">On-hand qty</p>
                  <p className="font-bold text-lg">
                    {fmt(ca.current_position.quantity_on_hand, 0)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Average cost</p>
                  <p className="font-bold text-lg">{fmt(ca.current_position.average_cost)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total value</p>
                  <p className="font-bold text-lg">{fmt(ca.current_position.total_value)}</p>
                </div>
              </div>

              {/* Explanation text */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <pre className="text-xs text-blue-900 whitespace-pre-wrap font-sans leading-relaxed">
                    {ca.explanation}
                  </pre>
                </div>
              </div>

              {/* Hypothetical scenarios */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(
                  [
                    {
                      key: 'price_increase_10pct' as const,
                      label: '\u25b2 +10% price increase scenario',
                      accent: 'border-amber-300 bg-amber-50',
                    },
                    {
                      key: 'price_decrease_10pct' as const,
                      label: '\u25bc \u221210% price decrease scenario',
                      accent: 'border-blue-300 bg-blue-50',
                    },
                  ] as const
                ).map(({ key, label, accent }) => {
                  const s = ca.examples[key];
                  return (
                    <div key={key} className={`rounded-lg border ${accent} p-4 text-xs space-y-2`}>
                      <p className="font-semibold text-sm">{label}</p>
                      <p>
                        Hypothetical receipt:{' '}
                        <strong>
                          {fmt(s.purchase_qty, 0)} units @ {fmt(s.purchase_cost)}
                        </strong>
                      </p>
                      <div className="font-mono bg-white/60 rounded p-2 text-xs leading-loose whitespace-pre">
                        {s.journal_entry.debit}
                        {'\n'}
                        {s.journal_entry.credit}
                      </div>
                      <p>
                        New avg cost: <strong>{fmt(s.new_avg_cost)}</strong> (
                        {s.avg_cost_change >= 0 ? '+' : ''}
                        {fmt(s.avg_cost_change)} change)
                      </p>
                      <p>
                        Implicit stock revaluation: {s.implicit_stock_reval >= 0 ? '+' : ''}
                        {fmt(s.implicit_stock_reval)}
                      </p>
                      <p>
                        Future COGS/unit: <strong>{fmt(s.future_cogs_per_unit)}</strong>
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main page component ───────────────────────────────────────────────────────

const InventoryLedger: React.FC = () => {
  const { id: itemId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<{
    date_from?: string;
    date_to?: string;
    location_id?: number;
  }>({});

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const numericId = parseInt(itemId || '0');
  const { data: ledger, isLoading } = useItemLifecycleLedger(numericId, filters, !!itemId);

  const toggleRow = (seq: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(seq)) {
        next.delete(seq);
      } else {
        next.add(seq);
      }
      return next;
    });
  };

  const handleDownload = () => {
    if (!ledger) return;
    const headers = [
      'Seq',
      'Date',
      'Type',
      'Source Doc',
      'PO #',
      'Supplier',
      'Invoice #',
      'MR #',
      'Qty In',
      'Qty Out',
      'Balance',
      'Unit Cost',
      'Avg Cost',
      'Stock Value',
      'Location',
      'By',
    ];
    const rows = ledger.entries.map(e => [
      e.seq,
      e.date,
      e.movement_type_display,
      e.source?.document_number ?? e.reference ?? '',
      e.source?.purchase_order?.po_number ?? '',
      e.source?.purchase_order?.supplier_name ?? '',
      e.invoice?.invoice_number ?? '',
      e.material_request?.request_number ?? '',
      e.quantity_in || '',
      e.quantity_out || '',
      e.running_qty,
      e.unit_cost,
      e.running_avg_cost,
      e.running_value,
      e.location?.name ?? '',
      e.created_by ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `lifecycle-${ledger.item.sku}-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Item ledger not found. Please check the item ID.</p>
        </div>
      </div>
    );
  }

  const { item, summary } = ledger;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 print:px-0 print:py-2">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            <p className="text-sm text-gray-500">
              SKU: <span className="font-mono font-medium">{item.sku}</span>
              {item.category_name && <> &middot; {item.category_name}</>}
              {!item.is_active && (
                <span className="ml-2 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                  Inactive
                </span>
              )}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              VALUATION_COLORS[item.valuation_method] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {item.valuation_method_display}
          </span>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* ── Live stock banner ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <p className="text-xs text-gray-500">Current On-Hand</p>
          <p className="text-xl font-bold">
            {fmt(item.current_quantity, 0)}{' '}
            <span className="text-sm font-normal text-gray-500">{item.unit_of_measure}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Current Avg Cost</p>
          <p className="text-xl font-bold">{fmt(item.current_cost)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Current Stock Value</p>
          <p className="text-xl font-bold">{fmt(item.current_value)}</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            title="Date from"
            value={filters.date_from ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            title="Date to"
            value={filters.date_to ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <button
          onClick={() => setFilters({})}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Clear
        </button>
        {summary.cost_change_count > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            <AlertTriangle className="w-3 h-3" />
            {summary.cost_change_count} cost change
            {summary.cost_change_count > 1 ? 's' : ''} in period
          </span>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Opening Balance"
          qty={summary.opening_qty}
          value={summary.opening_value}
          avgCost={summary.opening_avg_cost}
          uom={item.unit_of_measure}
          accent="border-gray-200"
        />
        <SummaryCard
          label="Total Received"
          qty={summary.total_received_qty}
          value={summary.total_received_value}
          avgCost={
            summary.total_received_qty > 0
              ? summary.total_received_value / summary.total_received_qty
              : 0
          }
          uom={item.unit_of_measure}
          accent="border-green-200"
        />
        <SummaryCard
          label="Total Issued"
          qty={summary.total_issued_qty}
          value={summary.total_issued_value}
          avgCost={
            summary.total_issued_qty > 0 ? summary.total_issued_value / summary.total_issued_qty : 0
          }
          uom={item.unit_of_measure}
          accent="border-red-200"
        />
        <SummaryCard
          label="Closing Balance"
          qty={summary.closing_qty}
          value={summary.closing_value}
          avgCost={summary.closing_avg_cost}
          uom={item.unit_of_measure}
          accent="border-blue-300"
        />
      </div>

      {/* ── Cost analysis accordion ── */}
      <CostAnalysisPanel itemId={numericId} />

      {/* ── Lifecycle ledger table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Lifecycle Ledger
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({ledger.entry_count} movement{ledger.entry_count !== 1 ? 's' : ''})
            </span>
          </h2>
        </div>

        {ledger.entry_count === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No movements found for the selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b">
                  <th className="w-8" />
                  <th className="px-3 py-3 text-left w-10">#</th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-3 py-3 text-left">Source Document</th>
                  <th className="px-3 py-3 text-left">MR #</th>
                  <th className="px-3 py-3 text-right">Qty In</th>
                  <th className="px-3 py-3 text-right">Qty Out</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                  <th className="px-3 py-3 text-right">Unit Cost</th>
                  <th className="px-3 py-3 text-right">Avg Cost</th>
                  <th className="px-3 py-3 text-right">Stock Value</th>
                  <th className="px-3 py-3 text-left">By</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map(entry => (
                  <EntryRow
                    key={entry.seq}
                    entry={entry}
                    expanded={expandedRows.has(entry.seq)}
                    onToggle={() => toggleRow(entry.seq)}
                  />
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-sm font-semibold">
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-gray-600">
                    Period Totals
                  </td>
                  <td className="px-3 py-3 text-right text-green-700">
                    +{fmt(summary.total_received_qty, 0)}
                  </td>
                  <td className="px-3 py-3 text-right text-red-600">
                    -{fmt(summary.total_issued_qty, 0)}
                  </td>
                  <td className="px-3 py-3 text-right">{fmt(summary.closing_qty, 0)}</td>
                  <td />
                  <td className="px-3 py-3 text-right">{fmt(summary.closing_avg_cost)}</td>
                  <td className="px-3 py-3 text-right">{fmt(summary.closing_value)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryLedger;
