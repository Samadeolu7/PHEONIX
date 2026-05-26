/**
 * PAYMENT PLAN LIST PAGE
 *
 * Displays all active payment plans and overdue installments across clients.
 * Two tabs:
 *   - Payment Plans: list of all plans with status/progress
 *   - Overdue Installments: cross-plan view of all overdue instalments
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  CreditCard,
  DollarSign,
  Search,
  User,
  XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import paymentPlanService from '../../services/paymentPlanService';
import type {
  PaymentPlan,
  PaymentPlanInstallment,
  PaymentPlanStatus,
  InstallmentStatus,
} from '../../types/paymentPlan';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ================================================================
// CONFIG
// ================================================================

type PlanStatusConfig = Record<PaymentPlanStatus, { label: string; cls: string }>;

const PLAN_STATUS_CONFIG: PlanStatusConfig = {
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', cls: 'bg-blue-100 text-blue-700' },
  defaulted: { label: 'Defaulted', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
};

type InstallmentStatusConfig = Record<InstallmentStatus, { label: string; cls: string }>;

const INSTALLMENT_STATUS_CONFIG: InstallmentStatusConfig = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', cls: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
  waived: { label: 'Waived', cls: 'bg-gray-100 text-gray-600' },
};

type Tab = 'plans' | 'overdue';

// ================================================================
// MAIN COMPONENT
// ================================================================

const PaymentPlanListPage: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('plans');
  const [planSearch, setPlanSearch] = useState('');
  const [planStatus, setPlanStatus] = useState<PaymentPlanStatus | ''>('');
  const [planPage, setPlanPage] = useState(1);

  const [overdueSearch, setOverdueSearch] = useState('');
  const [overduePage, setOverduePage] = useState(1);

  // ================================================================
  // QUERIES
  // ================================================================

  const plansQuery = useQuery({
    queryKey: ['payment-plans', planStatus, planSearch, planPage],
    queryFn: () =>
      paymentPlanService.getPaymentPlans(
        { status: planStatus || undefined, search: planSearch || undefined },
        planPage
      ),
  });

  const overdueQuery = useQuery({
    queryKey: ['installments-overdue', overdueSearch, overduePage],
    queryFn: () =>
      paymentPlanService.getInstallments(
        { is_overdue: true, search: overdueSearch || undefined },
        overduePage
      ),
    enabled: activeTab === 'overdue',
  });

  // ================================================================
  // HANDLERS
  // ================================================================

  const handlePlanSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPlanPage(1);
    plansQuery.refetch();
  };

  const handleOverdueSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOverduePage(1);
    overdueQuery.refetch();
  };

  // ================================================================
  // HELPERS
  // ================================================================

  const getPlanProgress = (plan: PaymentPlan): number => {
    const total = parseFloat(plan.total_amount);
    if (total === 0) return 0;
    const paid = plan.installments.reduce((sum, inst) => sum + parseFloat(inst.amount_paid), 0);
    return Math.min(100, Math.round((paid / total) * 100));
  };

  // ================================================================
  // RENDER
  // ================================================================

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Payment Plans</h1>
        <p className="mt-2 text-gray-600">
          Monitor client payment plans and track overdue installments
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <CreditCard className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Active Plans</p>
            <p className="text-2xl font-bold text-gray-900">
              {plansQuery.data?.results.filter(p => p.status === 'active').length ?? '—'}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-amber-100 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Overdue Installments</p>
            <p className="text-2xl font-bold text-amber-600">{overdueQuery.data?.count ?? '—'}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-lg">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Defaulted Plans</p>
            <p className="text-2xl font-bold text-red-600">
              {plansQuery.data?.results.filter(p => p.status === 'defaulted').length ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'plans'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Payment Plans
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'overdue'
                  ? 'border-b-2 border-red-600 text-red-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Overdue Installments
              {(overdueQuery.data?.count ?? 0) > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                  {overdueQuery.data?.count}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="p-4">
            {/* Filters */}
            <form onSubmit={handlePlanSearch} className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  title="Search payment plans"
                  placeholder="Search by client or plan name..."
                  value={planSearch}
                  onChange={e => setPlanSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <select
                title="Filter by status"
                value={planStatus}
                onChange={e => {
                  setPlanStatus(e.target.value as PaymentPlanStatus | '');
                  setPlanPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="defaulted">Defaulted</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Search
              </button>
            </form>

            {/* Plans Table */}
            {plansQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : plansQuery.isError ? (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 p-4 rounded-lg">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">Failed to load payment plans.</p>
              </div>
            ) : plansQuery.data?.results.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No payment plans found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Client
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Total Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Installments
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Progress
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        End Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {plansQuery.data?.results.map((plan: PaymentPlan) => {
                      const cfg = PLAN_STATUS_CONFIG[plan.status] ?? {
                        label: plan.status,
                        cls: 'bg-gray-100 text-gray-600',
                      };
                      const progress = getPlanProgress(plan);
                      return (
                        <tr
                          key={plan.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/receivables/payment-plans/${plan.id}`)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900">
                                {plan.client_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{plan.plan_name}</p>
                            <p className="text-xs text-gray-500 capitalize">{plan.frequency}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-900">
                                {formatCurrency(parseFloat(plan.total_amount))}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {plan.number_of_installments}x{' '}
                            {formatCurrency(parseFloat(plan.installment_amount))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 w-24">
                                <div className="bg-blue-600 h-2 rounded-full" />
                              </div>
                              <span className="text-xs text-gray-600">{progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cfg.cls}`}
                            >
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              {formatDate(plan.end_date)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {(plansQuery.data?.count ?? 0) > 20 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Page {planPage} · {plansQuery.data?.count} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlanPage(p => Math.max(1, p - 1))}
                    disabled={planPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPlanPage(p => p + 1)}
                    disabled={!plansQuery.data?.next}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overdue Installments Tab */}
        {activeTab === 'overdue' && (
          <div className="p-4">
            {/* Filters */}
            <form onSubmit={handleOverdueSearch} className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  title="Search overdue installments"
                  placeholder="Search overdue installments..."
                  value={overdueSearch}
                  onChange={e => setOverdueSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Search
              </button>
            </form>

            {/* Overdue Table */}
            {overdueQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
              </div>
            ) : overdueQuery.isError ? (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 p-4 rounded-lg">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">Failed to load overdue installments.</p>
              </div>
            ) : overdueQuery.data?.results.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-500">No overdue installments</p>
                <p className="text-sm text-gray-400 mt-1">All installments are up to date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Installment #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Due Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount Due
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount Paid
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Penalty
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {overdueQuery.data?.results.map((inst: PaymentPlanInstallment) => {
                      const cfg = INSTALLMENT_STATUS_CONFIG[inst.status] ?? {
                        label: inst.status,
                        cls: 'bg-gray-100 text-gray-600',
                      };
                      return (
                        <tr key={inst.id} className="hover:bg-red-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                            Plan #{inst.payment_plan}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            #{inst.installment_number}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm text-red-700 font-medium">
                              <AlertTriangle className="w-4 h-4" />
                              {formatDate(inst.due_date)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(parseFloat(inst.amount_due))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(parseFloat(inst.amount_paid))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-700">
                            {formatCurrency(parseFloat(inst.balance))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-amber-700">
                            {parseFloat(inst.penalty_amount) > 0
                              ? formatCurrency(parseFloat(inst.penalty_amount))
                              : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cfg.cls}`}
                            >
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {(overdueQuery.data?.count ?? 0) > 20 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Page {overduePage} · {overdueQuery.data?.count} total overdue
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOverduePage(p => Math.max(1, p - 1))}
                    disabled={overduePage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setOverduePage(p => p + 1)}
                    disabled={!overdueQuery.data?.next}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentPlanListPage;
