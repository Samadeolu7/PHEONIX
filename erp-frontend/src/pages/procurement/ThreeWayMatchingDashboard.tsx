// src/pages/procurement/ThreeWayMatchingDashboard.tsx
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GitMerge,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import {
  procurementService,
  ThreeWayMatchResult,
  ThreeWayMatchStatus,
} from '../../services/procurementService';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ThreeWayMatchStatus, { label: string; cls: string; Icon: LucideIcon }> =
  {
    passed: {
      label: 'Passed',
      cls: 'text-green-700 bg-green-50 border-green-200',
      Icon: CheckCircle2,
    },
    warning: {
      label: 'Warning',
      cls: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: AlertTriangle,
    },
    failed: { label: 'Failed', cls: 'text-red-700 bg-red-50 border-red-200', Icon: XCircle },
  };

// ─── Component ────────────────────────────────────────────────────────────────

const ThreeWayMatchingDashboard: React.FC = () => {
  const [poId, setPoId] = useState<number | ''>('');
  const [grnId, setGrnId] = useState<number | ''>('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [result, setResult] = useState<ThreeWayMatchResult | null>(null);
  const [showDiscrepancies, setShowDiscrepancies] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Load POs for picker
  const { data: posData } = useQuery({
    queryKey: ['po-list-for-matching'],
    queryFn: () =>
      procurementService.getPurchaseOrders({
        page_size: 200,
        ordering: '-created_at',
      } as Parameters<typeof procurementService.getPurchaseOrders>[0]),
    staleTime: 2 * 60 * 1000,
  });

  // Load GRNs for picker
  const { data: grnsData } = useQuery({
    queryKey: ['grn-list-for-matching'],
    queryFn: () => procurementService.getGRNs({ ordering: '-received_date' }),
    staleTime: 2 * 60 * 1000,
  });

  const matchMutation = useMutation({
    mutationFn: procurementService.performThreeWayMatch.bind(procurementService),
  });

  const handleValidate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setResult(null);

    if (!poId || !grnId) {
      setFormError('Please select both a Purchase Order and a GRN');
      return;
    }

    try {
      const res = await matchMutation.mutateAsync({
        po_id: Number(poId),
        grn_id: Number(grnId),
        ...(invoiceAmount.trim() ? { invoice_amount: invoiceAmount.trim() } : {}),
      });
      setResult(res);
      setShowDiscrepancies(true);
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { detail?: string; error?: string } };
        message?: string;
      };
      setFormError(
        e2?.response?.data?.detail ??
          e2?.response?.data?.error ??
          (err instanceof Error ? err.message : 'Validation failed')
      );
    }
  };

  const pos = posData?.results ?? [];
  const grns = grnsData?.results ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitMerge className="text-blue-600" size={22} />
            3-Way Match Validation
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Validate that a Purchase Order, Goods Receipt, and Supplier Invoice align
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Validation Form */}
        <form
          onSubmit={handleValidate}
          className="bg-white rounded-lg border border-gray-200 p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Select Documents to Match
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PO Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase Order <span className="text-red-500">*</span>
              </label>
              <select
                title="Select Purchase Order"
                value={poId}
                onChange={e => {
                  setPoId(e.target.value ? Number(e.target.value) : '');
                  setResult(null);
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a PO…</option>
                {pos.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.po_number} — {po.supplier_name} (
                    {Number(po.total_amount).toLocaleString('en-NG', {
                      style: 'currency',
                      currency: 'NGN',
                      minimumFractionDigits: 0,
                    })}
                    )
                  </option>
                ))}
              </select>
            </div>

            {/* GRN Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Goods Receipt (GRN) <span className="text-red-500">*</span>
              </label>
              <select
                title="Select Goods Receipt Note"
                value={grnId}
                onChange={e => {
                  setGrnId(e.target.value ? Number(e.target.value) : '');
                  setResult(null);
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a GRN…</option>
                {grns.map(grn => (
                  <option key={grn.id} value={grn.id}>
                    {grn.grn_number} — {grn.received_date}{' '}
                    {grn.po_number ? `(PO: ${grn.po_number})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Invoice Amount */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier Invoice Amount{' '}
                <span className="text-xs text-gray-400 font-normal">
                  (optional — for full 3-way match)
                </span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                title="Supplier invoice amount"
                value={invoiceAmount}
                onChange={e => {
                  if (!isValidDecimalInput(e.target.value)) {
                    return;
                  }
                  setInvoiceAmount(e.target.value);
                  setResult(null);
                }}
                placeholder="e.g. 150000.00"
                className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank for PO ↔ GRN match only</p>
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <XCircle size={14} className="flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={matchMutation.isPending || !poId || !grnId}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {matchMutation.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Validating…
                </>
              ) : (
                <>
                  <GitMerge size={15} />
                  Validate Match
                </>
              )}
            </button>
          </div>
        </form>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Status banner */}
            {(() => {
              const cfg = STATUS_CONFIG[result.overall_status];
              const Icon = cfg.Icon;
              return (
                <div className={`flex items-center gap-3 px-5 py-4 border-b ${cfg.cls}`}>
                  <Icon size={22} className="flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-base">
                      Match {cfg.label}
                      {result.critical_failures
                        ? ` — ${result.critical_failures} critical failure${result.critical_failures !== 1 ? 's' : ''}`
                        : ''}
                      {result.warnings
                        ? ` — ${result.warnings} warning${result.warnings !== 1 ? 's' : ''}`
                        : ''}
                    </p>
                    {result.summary && (
                      <p className="text-sm mt-0.5 opacity-80">{result.summary}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Decision flags */}
            <div className="px-5 py-3 flex flex-wrap gap-4 text-sm border-b border-gray-100">
              <span
                className={`flex items-center gap-1.5 ${result.can_proceed ? 'text-green-700' : 'text-red-600'}`}
              >
                {result.can_proceed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {result.can_proceed
                  ? 'Can proceed to payment'
                  : 'Cannot proceed — resolve issues first'}
              </span>
              {result.requires_approval && (
                <span className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle size={14} />
                  Requires approval
                  {result.approver_roles?.length ? ` (${result.approver_roles.join(', ')})` : ''}
                </span>
              )}
            </div>

            {/* Discrepancies */}
            {result.discrepancies && result.discrepancies.length > 0 && (
              <div className="px-5 py-3">
                <button
                  type="button"
                  title="Toggle discrepancies"
                  onClick={() => setShowDiscrepancies(d => !d)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {showDiscrepancies ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {result.discrepancies.length} Discrepanc
                  {result.discrepancies.length !== 1 ? 'ies' : 'y'}
                </button>
                {showDiscrepancies && (
                  <ul className="mt-2 space-y-1">
                    {result.discrepancies.map((d, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-700 bg-red-50 rounded px-3 py-2"
                      >
                        <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <span>
                          {typeof d === 'object' && d !== null
                            ? ((d.message as string) ??
                              (d.description as string) ??
                              JSON.stringify(d))
                            : String(d)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Full report */}
            {result.report && (
              <details className="px-5 py-3 border-t border-gray-100">
                <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
                  Full Match Report
                </summary>
                <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-64 overflow-y-auto">
                  {result.report}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreeWayMatchingDashboard;
