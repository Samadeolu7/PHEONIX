import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { procurementService } from '../../services/procurementService';
import {
  BudgetCode,
  BudgetUtilization,
  BudgetValidationResult,
  CostCenter,
} from '../../types/procurement';

interface BudgetTrackerProps {
  budgetCodeId?: number;
  amount?: string;
  transactionDate?: string;
  onValidationResult?: (result: BudgetValidationResult) => void;
  showUtilization?: boolean;
  showValidation?: boolean;
}

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({
  budgetCodeId,
  amount,
  transactionDate,
  onValidationResult,
  showUtilization = true,
  showValidation = true,
}) => {
  const [selectedBudgetCode, setSelectedBudgetCode] = useState<number | null>(budgetCodeId || null);

  const [validationForm, setValidationForm] = useState({
    amount: amount || '',
    transaction_date: transactionDate || new Date().toISOString().split('T')[0],
  });

  const { data: budgetCodesData, isLoading: loadingBudgetCodes } = useQuery<{ results: BudgetCode[] }>({
    queryKey: ['budget-codes'],
    queryFn: () => procurementService.getBudgetCodes({ is_active: true } as any),
  });

  const { data: costCentersData } = useQuery<{ results: CostCenter[] }>({
    queryKey: ['cost-centers'],
    queryFn: () => procurementService.getCostCenters({ is_active: true } as any),
  });

  const budgetCodes = budgetCodesData?.results || [];
  const costCenters = costCentersData?.results || [];

  const { data: budgetUtilization } = useQuery<BudgetUtilization>({
    queryKey: ['budget-utilization', selectedBudgetCode],
    queryFn: () => procurementService.getBudgetUtilization(selectedBudgetCode!),
    enabled: !!selectedBudgetCode && showUtilization,
  });

  const { data: validationResult } = useQuery<BudgetValidationResult>({
    queryKey: ['budget-validation', selectedBudgetCode, validationForm.amount, validationForm.transaction_date],
    queryFn: () => {
      const result = procurementService.validateBudgetAvailability({
        budget_code_id: selectedBudgetCode!,
        amount: validationForm.amount,
        transaction_date: validationForm.transaction_date,
      });
      result.then(r => onValidationResult?.(r));
      return result;
    },
    enabled: !!selectedBudgetCode && !!validationForm.amount && !!validationForm.transaction_date && showValidation,
  });

  const loading = loadingBudgetCodes;
  const error = null;

  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getValidationColor = (isValid: boolean) => {
    return isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(num);
  };

  if (loading && budgetCodes.length === 0) {
    return <div className="p-4">Loading budget data...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {/* Budget Code Selection */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Tracking</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Budget Code</label>
            <select
              value={selectedBudgetCode || ''}
              onChange={e =>
                setSelectedBudgetCode(e.target.value ? parseInt(e.target.value) : null)
              }
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Budget Code</option>
              {budgetCodes.map(bc => (
                <option key={bc.id} value={bc.id}>
                  {bc.code} - {bc.name} ({bc.cost_center.name})
                </option>
              ))}
            </select>
          </div>

          {showValidation && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Transaction Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={validationForm.amount}
                  onChange={e => setValidationForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Transaction Date</label>
                <input
                  type="date"
                  value={validationForm.transaction_date}
                  onChange={e =>
                    setValidationForm(prev => ({ ...prev, transaction_date: e.target.value }))
                  }
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Budget Utilization */}
      {showUtilization && budgetUtilization && (
        <div className="bg-white shadow rounded-lg p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">
            Budget Utilization - {budgetUtilization.budget_code.code}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-500">Total Budget</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(budgetUtilization.total_budget)}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-blue-600">Utilized</div>
              <div className="text-2xl font-bold text-blue-900">
                {formatCurrency(budgetUtilization.utilized_amount)}
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-yellow-600">Committed</div>
              <div className="text-2xl font-bold text-yellow-900">
                {formatCurrency(budgetUtilization.committed_amount)}
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-green-600">Available</div>
              <div className="text-2xl font-bold text-green-900">
                {formatCurrency(budgetUtilization.available_amount)}
              </div>
            </div>
          </div>

          {/* Utilization Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Budget Utilization</span>
              <span>{budgetUtilization.utilization_percentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${getUtilizationColor(budgetUtilization.utilization_percentage)}`}
                style={{ width: `${Math.min(budgetUtilization.utilization_percentage, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Recent Transactions */}
          {budgetUtilization.transactions.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-900 mb-3">Recent Transactions</h5>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reference
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {budgetUtilization.transactions.slice(0, 5).map(transaction => (
                      <tr key={transaction.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(transaction.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                          {transaction.reference_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {transaction.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              transaction.transaction_type === 'commitment'
                                ? 'bg-yellow-100 text-yellow-800'
                                : transaction.transaction_type === 'utilization'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {transaction.transaction_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                          {formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Budget Validation Result */}
      {showValidation && validationResult && (
        <div className={`border rounded-lg p-6 ${getValidationColor(validationResult.is_valid)}`}>
          <h4 className="text-lg font-medium mb-4">Budget Validation Result</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-sm font-medium text-gray-600">Requested Amount</div>
              <div className="text-lg font-bold">
                {formatCurrency(validationResult.requested_amount)}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-600">Available Amount</div>
              <div className="text-lg font-bold">
                {formatCurrency(validationResult.available_amount)}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-600">Remaining After</div>
              <div className="text-lg font-bold">
                {formatCurrency(validationResult.remaining_amount)}
              </div>
            </div>
          </div>

          <div
            className={`p-4 rounded-md ${
              validationResult.is_valid ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <div
              className={`font-medium ${
                validationResult.is_valid ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {validationResult.validation_message}
            </div>

            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <div className="mt-2">
                <div className="text-sm font-medium text-yellow-800">Warnings:</div>
                <ul className="list-disc list-inside text-sm text-yellow-700">
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div
            className={`mt-4 flex items-center ${
              validationResult.is_valid ? 'text-green-600' : 'text-red-600'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full mr-2 ${
                validationResult.is_valid ? 'bg-green-500' : 'bg-red-500'
              }`}
            ></div>
            <span className="font-medium">
              {validationResult.is_valid ? 'Budget Available' : 'Insufficient Budget'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetTracker;
