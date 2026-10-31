// src/services/recoveryTargetService.ts
/**
 * Officer monthly recovery targets.
 * Consumes /api/analytics/recovery-targets/ (analytics/views.py::RecoveryTargetsView).
 * Targets are set by managers; every recovered figure is computed server-side
 * from actual loan repayments, so nobody types running totals by hand.
 */
import { api, triggerDownload } from './api';

export type RecoveryStatus = 'achieved' | 'on_pace' | 'slightly_behind' | 'behind' | 'no_target';

export interface RecoveryDay {
  date: string;
  amount: string;
}

export interface RecoveryOfficerRow {
  staff_id: number;
  name: string;
  position: string;
  branch_name: string;
  target: string | null;
  notes: string;
  previous_target: string | null;
  recovered_today: string;
  recovered_mtd: string;
  daily: RecoveryDay[];
  balance: string | null;
  pct_achieved: string | null;
  expected_to_date: string | null;
  pace_gap: string | null;
  required_daily: string | null;
  status: RecoveryStatus;
}

export interface RecoveryTotals {
  target: string;
  recovered_today: string;
  recovered_mtd: string;
  balance: string;
  expected_to_date: string;
  pct_achieved: string | null;
  unassigned_recovered_mtd: string | null;
}

export interface RecoveryTargetsResponse {
  month: string;
  as_of: string | null;
  days_in_month: number;
  days_elapsed: number;
  pct_month_elapsed: string;
  can_set_targets: boolean;
  officers: RecoveryOfficerRow[];
  totals: RecoveryTotals;
}

export interface TargetInput {
  staff_id: number;
  target_amount: string | null;
  notes?: string;
}

const BASE = '/analytics/recovery-targets/';

export const recoveryTargetService = {
  async get(month: string, asOf?: string): Promise<RecoveryTargetsResponse> {
    return api.get(BASE, { params: { month, as_of: asOf || undefined } });
  },

  async save(month: string, targets: TargetInput[]): Promise<{ saved: number; removed: number }> {
    return api.post(BASE, { month, targets });
  },

  async downloadCsv(month: string): Promise<void> {
    const blob = await api.getBlob(BASE, { params: { month, export: 'csv' } });
    triggerDownload(blob, `recovery-targets-${month}.csv`);
  },
};
