// src/services/recoveryTargetService.ts
/**
 * Officer monthly recovery targets.
 * Consumes /api/analytics/recovery-targets/ (analytics/views.py::RecoveryTargetsView).
 * Targets are set by managers; every recovered figure is computed server-side
 * from actual repayments on loans 30+ days in default, so nobody types running
 * totals by hand.
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
  /** A payment counts as recovery only if the loan was at least this many days overdue that day. */
  min_days_overdue: number;
  officers: RecoveryOfficerRow[];
  totals: RecoveryTotals;
}

export interface TargetInput {
  staff_id: number;
  target_amount: string | null;
  notes?: string;
}

export type RecoveryFocus = 'daily' | 'weekly' | 'monthly' | 'achieved';

/** The signed-in officer's own position, for the role-based dashboard card. */
export interface MyRecoveryTarget {
  has_target: boolean;
  month?: string;
  as_of?: string;
  /** Which goal to show: the first one (day → week → month) not yet met. */
  focus?: RecoveryFocus;
  focus_target?: string;
  focus_recovered?: string;
  shortfall?: string;
  above_target?: string;
  target?: string;
  daily_target?: string;
  /** Shortfall from earlier days this month, added on top of today's normal target. */
  daily_carried?: string;
  daily_goal?: string;
  weekly_target?: string;
  /** Shortfall from earlier weeks this month, added on top of this week's normal target. */
  weekly_carried?: string;
  weekly_goal?: string;
  week_start?: string;
  week_end?: string;
  recovered_today?: string;
  recovered_week?: string;
  recovered_mtd?: string;
  month_remaining?: string;
  days_left?: number;
  required_daily?: string;
  min_days_overdue?: number;
}

const BASE = '/analytics/recovery-targets/';

export const recoveryTargetService = {
  async get(month: string, asOf?: string): Promise<RecoveryTargetsResponse> {
    return api.get(BASE, { params: { month, as_of: asOf || undefined } });
  },

  async mine(): Promise<MyRecoveryTarget> {
    return api.get(`${BASE}mine/`);
  },

  async save(month: string, targets: TargetInput[]): Promise<{ saved: number; removed: number }> {
    return api.post(BASE, { month, targets });
  },

  async downloadCsv(month: string): Promise<void> {
    const blob = await api.getBlob(BASE, { params: { month, export: 'csv' } });
    triggerDownload(blob, `recovery-targets-${month}.csv`);
  },
};
