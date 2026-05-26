// src/pages/loans/LoanChargesSummaryModal.tsx
/**
 * Reusable modal: shows breakdown of Processing Fee + Insurance + Total Charges
 * Feature #11 — Insurance & Charges Summary
 */
import React from 'react';
import { LoanAccount } from '../../services/loanService';
import { X, DollarSign } from 'lucide-react';

interface Props {
  loan: LoanAccount;
  onClose: () => void;
}

const LoanChargesSummaryModal: React.FC<Props> = ({ loan, onClose }) => {
  const fmt = (v: string | number) =>
    Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const rows = [
    { label: 'Processing Fee', value: loan.charges_summary?.processing_fee ?? loan.processing_fee },
    { label: 'Insurance Amount', value: loan.charges_summary?.insurance_amount ?? loan.insurance_amount },
    { label: 'Total Charges', value: loan.charges_summary?.total_charges ?? loan.total_charges, bold: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            Charges Breakdown
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Rows */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-500">
            Loan: <span className="font-medium text-gray-800">{loan.loan_number}</span>
          </p>
          <div className="divide-y border rounded-lg overflow-hidden">
            {rows.map(({ label, value, bold }) => (
              <div key={label} className="flex justify-between items-center px-4 py-3 bg-white hover:bg-gray-50">
                <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                  {label}
                </span>
                <span className={`text-sm ${bold ? 'font-bold text-blue-700' : 'text-gray-800'}`}>
                  {fmt(value ?? '0')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoanChargesSummaryModal;
