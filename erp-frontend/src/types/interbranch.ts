// Inter-Branch Transfer types
// Mirrors interbranch.serializers.InterBranchTransferSerializer /
// CreateInterBranchTransferSerializer field-for-field.

export interface InterBranchTransfer {
  id: number;
  transfer_number: string;
  date: string;
  from_branch: number;
  from_branch_name: string;
  to_branch: number;
  to_branch_name: string;
  from_account: number;
  from_account_name: string;
  to_account: number;
  to_account_name: string;
  amount: string;
  description: string;
  status: 'posted' | 'reversed';
  status_display: string;
  source_transaction: number;
  source_transaction_reference: string;
  destination_transaction: number;
  destination_transaction_reference: string;
  initiated_by?: number;
  initiated_by_name?: string;
  reversed_by?: number;
  reversed_at?: string;
  reversal_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInterBranchTransferRequest {
  from_branch_id: number;
  to_branch_id: number;
  from_account_id: number;
  to_account_id: number;
  amount: string;
  description?: string;
  date?: string;
}

export interface ReverseInterBranchTransferRequest {
  reason: string;
}

export interface InterBranchTransferFilters {
  from_branch?: number;
  to_branch?: number;
  status?: InterBranchTransfer['status'];
  search?: string;
}
