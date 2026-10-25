/** Small formatting helpers shared by the treasury pages. */

export const naira = (v: string | number | undefined | null): string =>
  `₦${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDay = (iso: string | null | undefined): string =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export const todayIso = (): string => new Date().toISOString().split('T')[0];

export const isPast = (iso: string | null | undefined): boolean => !!iso && iso < todayIso();

/** Best human-readable message from an error thrown by services/api.ts. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; details?: Record<string, unknown> };
  const d = e?.details;
  if (d && typeof d === 'object') {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      const text = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : null;
      if (text) parts.push(k === 'non_field_errors' || k === 'detail' ? text : `${k}: ${text}`);
    }
    if (parts.length) return parts.join(' | ');
  }
  return e?.message || fallback;
}

export const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  paid_off: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Awaiting funds',
  active: 'Active',
  paid_off: 'Paid off',
  pending: 'Pending',
  sent: 'Sent',
  paid: 'Paid',
};
