/**
 * Savings — Client Contribution Amounts (hub)
 * Entry point for managing each client's committed contribution amount.
 * Lists every savings product with a contribution cycle configured; picking
 * one opens SavingsProductContributionsPage for that product's accounts.
 * Route: /savings/contributions
 */

import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, ChevronRight, Loader2 } from 'lucide-react';
import { useSavingsProducts } from '../../hooks/useSavings';

interface SavingsProductRow {
  id: number;
  name: string;
  contribution_cycle?: 'daily' | 'weekly' | 'monthly' | null;
  contribution_amount?: string | null;
}

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export default function SavingsContributionsHubPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useSavingsProducts();

  const products: SavingsProductRow[] = useMemo(() => {
    const raw = data as any;
    if (!raw) return [];
    // Show every savings product, not just ones with contribution_cycle set —
    // that field is configured separately from the daily-contribution income
    // behaviour and is easy to leave unset even on a genuine daily-contribution
    // product, which would otherwise hide it here entirely.
    return Array.isArray(raw) ? raw : (raw.results ?? []);
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link
            to="/savings"
            aria-label="Back to savings"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Client Contribution Amounts</h1>
            <p className="text-xs text-gray-500">
              Pick a product to view or update what each client committed to contribute per cycle.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Calculator className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">No savings products yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create a savings product to manage client contribution amounts here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => navigate(`/savings/products/${p.id}/contributions`)}
                className="w-full group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-teal-200 transition-all text-left"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.contribution_cycle
                      ? `${CYCLE_LABEL[p.contribution_cycle] ?? p.contribution_cycle} cycle`
                      : 'No cycle configured'}
                    {p.contribution_amount ? ` · Default ₦${parseFloat(p.contribution_amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
