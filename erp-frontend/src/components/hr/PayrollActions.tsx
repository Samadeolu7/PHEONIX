// Payroll Actions Component - Calculate/Approve/Process buttons
import React from 'react';
import { Calculator, CheckCircle, DollarSign, RefreshCw } from 'lucide-react';
import { Payroll, PayrollStatus } from '../../types/hr';

interface PayrollActionsProps {
  payroll: Payroll;
  onAction: (action: 'calculate' | 'recalculate' | 'approve' | 'process' | 'mark_paid') => void;
  loading?: string; // Which action is currently loading
  size?: 'sm' | 'md';
}

export const PayrollActions: React.FC<PayrollActionsProps> = ({
  payroll,
  onAction,
  loading = '',
  size = 'sm',
}) => {
  const buttonClasses = size === 'sm' ? 'p-1.5 text-xs' : 'px-3 py-2 text-sm';
  const iconClasses = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  // Determine which actions are available based on status
  const canCalculate = payroll.status === PayrollStatus.DRAFT;
  const canRecalculate = payroll.status === PayrollStatus.CALCULATED;
  const canApprove = payroll.status === PayrollStatus.CALCULATED;
  const isFirstApproval = canApprove;
  const isSecondApproval = false;

  const canMarkPaid = payroll.status === PayrollStatus.APPROVED;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Calculate Button */}
      {canCalculate && (
        <button
          onClick={() => onAction('calculate')}
          disabled={loading === 'calculate'}
          className={`
            ${buttonClasses}
            bg-orange-100 text-orange-700 border border-orange-200 rounded-lg
            hover:bg-orange-200 hover:border-orange-300
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200 flex items-center gap-1
          `}
          title="Calculate Payroll"
        >
          {loading === 'calculate' ? (
            <div
              className={`animate-spin rounded-full border-b-2 border-orange-600 ${iconClasses}`}
            ></div>
          ) : (
            <>
              <Calculator className={iconClasses} />
              {size === 'md' && 'Calculate'}
            </>
          )}
        </button>
      )}

      {/* Recalculate Button — available on calculated payrolls to include new data (e.g. IOUs added after first calculation) */}
      {canRecalculate && (
        <button
          onClick={() => onAction('recalculate')}
          disabled={loading === 'recalculate'}
          className={`
            ${buttonClasses}
            bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-lg
            hover:bg-yellow-200 hover:border-yellow-300
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200 flex items-center gap-1
          `}
          title="Recalculate — wipes stale payslips and recalculates from scratch (includes any IOUs or bonuses added since last calculation)"
        >
          {loading === 'recalculate' ? (
            <div
              className={`animate-spin rounded-full border-b-2 border-yellow-600 ${iconClasses}`}
            ></div>
          ) : (
            <>
              <RefreshCw className={iconClasses} />
              {size === 'md' && 'Recalculate'}
            </>
          )}
        </button>
      )}

      {/* Approve Button */}
      {isFirstApproval && (
        <button
          onClick={() => onAction('approve')}
          disabled={loading === 'approve'}
          className={`
            ${buttonClasses}
            bg-blue-100 text-blue-700 border border-blue-200 rounded-lg
            hover:bg-blue-200 hover:border-blue-300
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200 flex items-center gap-1
          `}
          title="First Approval — records intent, no accounting posted yet"
        >
          {loading === 'approve' ? (
            <div
              className={`animate-spin rounded-full border-b-2 border-blue-600 ${iconClasses}`}
            ></div>
          ) : (
            <>
              <CheckCircle className={iconClasses} />
              {size === 'md' && 'Approve'}
            </>
          )}
        </button>
      )}

      {/* Mark as Paid Button */}
      {canMarkPaid && (
        <button
          onClick={() => onAction('mark_paid')}
          disabled={loading === 'mark_paid'}
          className={`
            ${buttonClasses}
            bg-purple-100 text-purple-700 border border-purple-200 rounded-lg
            hover:bg-purple-200 hover:border-purple-300
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200 flex items-center gap-1
          `}
          title="Mark Payroll as Paid — posts disbursement journal entry (DR Salary Payable / CR Bank)"
        >
          {loading === 'mark_paid' ? (
            <div
              className={`animate-spin rounded-full border-b-2 border-purple-600 ${iconClasses}`}
            ></div>
          ) : (
            <>
              <DollarSign className={iconClasses} />
              {size === 'md' && 'Mark as Paid'}
            </>
          )}
        </button>
      )}

      {/* Status indicator when no actions available */}
      {!canCalculate && !canApprove && !canMarkPaid && payroll.status === PayrollStatus.PAID && (
        <span className="text-xs text-green-600 font-medium">Completed</span>
      )}
      {!canCalculate &&
        !canApprove &&
        !canMarkPaid &&
        payroll.status === PayrollStatus.CANCELLED && (
          <span className="text-xs text-red-600 font-medium">Cancelled</span>
        )}
    </div>
  );
};
