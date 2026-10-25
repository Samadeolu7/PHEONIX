import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { LiquidityImpactPanel } from './LiquidityImpactPanel';
import type { LiquidityGatePayload } from '../../types/bankBorrowing';

interface Props {
  gate: LiquidityGatePayload | null;
  isSubmitting: boolean;
  onClose: () => void;
  /** Director confirms the override with a written reason. */
  onOverride: (reason: string) => void;
}

/**
 * Shown when approving a loan is stopped because the branch's cash is committed to upcoming payments.
 * Non-directors just see why; a director sees the impact and can override with a reason.
 */
export const LoanApprovalLiquidityDialog: React.FC<Props> = ({ gate, isSubmitting, onClose, onOverride }) => {
  const [reason, setReason] = useState('');
  if (!gate) return null;

  const canOverride = gate.code === 'liquidity_override_required';

  return (
    <Modal open onClose={onClose} title="Not enough uncommitted cash to approve this loan" size="large">
      <div className="space-y-4">
        <LiquidityImpactPanel assessment={gate.assessment} stage="approval" />

        {canOverride ? (
          <div className="border-t pt-4 space-y-3">
            <p className="flex items-center gap-2 font-medium text-gray-900">
              <ShieldAlert className="w-4 h-4 text-amber-600" /> Director override
            </p>
            <p className="text-sm text-gray-600">
              Approving anyway is recorded against your name. A different director must then disburse the loan and
              acknowledge the same impact.
            </p>
            <textarea
              title="Reason for override"
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-amber-500"
              rows={3}
              placeholder="Why is this loan worth approving now? (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !reason.trim()}
                onClick={() => onOverride(reason.trim())}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Override and approve
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t pt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Only a director can override this. Ask one to review it, or wait until the date above.
            </p>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-900 text-white">
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default LoanApprovalLiquidityDialog;
