// src/services/academicSessionService.ts
/**
 * Service for managing Academic Years (sessions) and Academic Terms.
 * Consumes /api/incomes/academic-years/ and /api/incomes/academic-terms/
 */
import { api } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AcademicTerm {
  id: number;
  academic_year: number;
  name: string;
  code: string;
  term_number: string;
  start_date: string;
  end_date: string;
  payment_due_date: string;
  invoice_generation_date: string | null;
  has_mid_term_break: boolean;
  mid_term_break_start: string | null;
  mid_term_break_end: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicYear {
  id: number;
  name: string;
  code: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
  term_system: 'trimester' | 'semester' | 'quarter';
  terms: AcademicTerm[];
  created_at: string;
  updated_at: string;
}

export interface CreateAcademicYearPayload {
  name: string;
  code: string;
  start_date: string;
  end_date: string;
  term_system: 'trimester' | 'semester' | 'quarter';
  is_active?: boolean;
}

export interface CreateAcademicTermPayload {
  academic_year: number;
  name: string;
  code: string;
  term_number: string;
  start_date: string;
  end_date: string;
  payment_due_date: string;
  invoice_generation_date?: string | null;
  has_mid_term_break?: boolean;
  mid_term_break_start?: string | null;
  mid_term_break_end?: string | null;
  is_active?: boolean;
}

export interface CloseSessionResult {
  detail: string;
  academic_year: AcademicYear;
  accounting_closure: {
    skipped: boolean;
    error: string | null;
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const academicSessionService = {
  /** List all academic years for the current tenant/branch. */
  async list(params?: { is_active?: boolean }): Promise<AcademicYear[]> {
    const response = await api.get('/incomes/academic-years/', { params });
    // api returns raw JSON: paginated {count, results, ...} or plain array
    if (Array.isArray(response)) return response;
    return response?.results ?? [];
  },

  /** Fetch a single academic year by id. */
  async get(id: number): Promise<AcademicYear> {
    return api.get(`/incomes/academic-years/${id}/`);
  },

  /** Create a new academic year. */
  async create(payload: CreateAcademicYearPayload): Promise<AcademicYear> {
    return api.post('/incomes/academic-years/', payload);
  },

  /** Update an existing academic year. */
  async update(id: number, payload: Partial<CreateAcademicYearPayload>): Promise<AcademicYear> {
    return api.patch(`/incomes/academic-years/${id}/`, payload);
  },

  /** Delete an academic year (only if not active). */
  async delete(id: number): Promise<void> {
    await api.delete(`/incomes/academic-years/${id}/`);
  },

  /** Return the currently active academic year. */
  async getCurrent(): Promise<AcademicYear | null> {
    try {
      return await api.get('/incomes/academic-years/current/');
    } catch {
      return null;
    }
  },

  /**
   * Activate an academic year (makes it the current session).
   * All other years are deactivated automatically.
   */
  async activate(id: number): Promise<AcademicYear> {
    return api.post(`/incomes/academic-years/${id}/activate/`);
  },

  /**
   * Close the current academic session.
   * - Deactivates the year
   * - Runs accounting year-end closure (retained earnings, opening balances)
   */
  async closeSession(id: number): Promise<CloseSessionResult> {
    return api.post(`/incomes/academic-years/${id}/close-session/`);
  },

  // ── Terms ──────────────────────────────────────────────────────────────────

  /** List all terms, optionally filtered by academic year. */
  async listTerms(academicYearId?: number): Promise<AcademicTerm[]> {
    const params = academicYearId ? { academic_year: academicYearId } : undefined;
    const response = await api.get('/incomes/academic-terms/', { params });
    if (Array.isArray(response)) return response;
    return response?.results ?? [];
  },

  /** Create a new term within an academic year. */
  async createTerm(payload: CreateAcademicTermPayload): Promise<AcademicTerm> {
    return api.post('/incomes/academic-terms/', payload);
  },

  /** Update a term. */
  async updateTerm(id: number, payload: Partial<CreateAcademicTermPayload>): Promise<AcademicTerm> {
    return api.patch(`/incomes/academic-terms/${id}/`, payload);
  },

  /** Delete a term. */
  async deleteTerm(id: number): Promise<void> {
    await api.delete(`/incomes/academic-terms/${id}/`);
  },
};

/** Generate the default academic year name and code from a start calendar year.
 *  e.g. 2025 → name: "2025-2026", code: "AY2025-2026"
 */
export function buildAcademicYearDefaults(startYear: number): { name: string; code: string } {
  const endYear = startYear + 1;
  return {
    name: `${startYear}-${endYear}`,
    code: `AY${startYear}-${endYear}`,
  };
}

/** Returns the current academic year name based on today's date
 *  (Nigerian schools: new session starts in September).
 */
export function getCurrentAcademicYearName(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-based
  // If we're past August, we're in the next session
  const sessionStart = month >= 9 ? year : year - 1;
  return buildAcademicYearDefaults(sessionStart).name;
}
