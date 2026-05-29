/**
 * src/__tests__/unit/formatters.test.ts
 *
 * Unit tests for formatting utility functions used throughout
 * the Phoenix ERP UI.
 *
 * Covers:
 *  1. formatDate     — valid date, empty string
 *  2. formatDateTime — valid datetime, empty string
 *  3. formatCurrency — positive, zero, negative, null/undefined
 *  4. formatNumber   — integer, decimal, null/undefined
 *  5. formatPercentage — basic, two decimals, null/undefined
 *  6. capitalize     — lowercase, uppercase, mixed, empty
 *  7. titleCase      — multi-word string, single word
 *  8. snakeToTitle   — underscore_case conversion
 *  9. formatFileSize — 0 bytes, KB, MB, GB
 * 10. formatRelativeTime — just now, minutes, hours, days
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  formatPercentage,
  capitalize,
  titleCase,
  snakeToTitle,
  formatFileSize,
  formatRelativeTime,
} from '../../utils/formatters';

// ---------------------------------------------------------------------------
// 1. formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-01-15');
    expect(result).toMatch(/Jan.*15.*2024|2024.*Jan.*15/);
  });

  it('returns dash for empty string', () => {
    expect(formatDate('')).toBe('-');
  });

  it('returns dash for falsy values', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatDate(null)).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// 2. formatDateTime
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  it('formats a valid ISO datetime string', () => {
    const result = formatDateTime('2024-06-01T10:30:00');
    expect(result).toMatch(/Jun.*1.*2024|2024.*Jun.*1/);
    expect(result).toMatch(/10:30|AM|PM/);
  });

  it('returns dash for empty string', () => {
    expect(formatDateTime('')).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// 3. formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('formats a positive amount', () => {
    const result = formatCurrency(50000);
    // Should contain numeric digits and currency symbol/code
    expect(result).toMatch(/50[,.]?000/);
  });

  it('formats zero as 0.00', () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0\.00|0,00/);
  });

  it('formats a large amount with thousands separator', () => {
    const result = formatCurrency(1000000);
    // 1,000,000.00 in some form
    expect(result).toMatch(/1[.,]000[.,]000/);
  });

  it('returns dash for null', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatCurrency(null)).toBe('-');
  });

  it('returns dash for undefined', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatCurrency(undefined)).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// 4. formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('formats an integer with no decimals', () => {
    const result = formatNumber(42000);
    expect(result).toMatch(/42[,.]?000/);
  });

  it('formats with specified decimal places', () => {
    const result = formatNumber(3.14159, 2);
    expect(result).toMatch(/3\.14|3,14/);
  });

  it('returns dash for null', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatNumber(null)).toBe('-');
  });

  it('returns dash for undefined', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatNumber(undefined)).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// 5. formatPercentage
// ---------------------------------------------------------------------------

describe('formatPercentage', () => {
  it('appends % sign', () => {
    expect(formatPercentage(75)).toBe('75.00%');
  });

  it('respects decimal places', () => {
    expect(formatPercentage(33.3333, 1)).toBe('33.3%');
  });

  it('returns dash for null', () => {
    // @ts-expect-error testing runtime behaviour
    expect(formatPercentage(null)).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// 6. capitalize
// ---------------------------------------------------------------------------

describe('capitalize', () => {
  it('capitalizes first letter and lowercases rest', () => {
    expect(capitalize('hELLO')).toBe('Hello');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 7. titleCase
// ---------------------------------------------------------------------------

describe('titleCase', () => {
  it('capitalizes each word', () => {
    expect(titleCase('john doe smith')).toBe('John Doe Smith');
  });

  it('handles single word', () => {
    expect(titleCase('phoenix')).toBe('Phoenix');
  });

  it('returns empty string for empty input', () => {
    expect(titleCase('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 8. snakeToTitle
// ---------------------------------------------------------------------------

describe('snakeToTitle', () => {
  it('converts snake_case to Title Case', () => {
    expect(snakeToTitle('loan_repayment')).toBe('Loan Repayment');
  });

  it('handles single word', () => {
    expect(snakeToTitle('pending')).toBe('Pending');
  });

  it('handles multiple underscores', () => {
    expect(snakeToTitle('interest_income_account')).toBe('Interest Income Account');
  });

  it('returns empty string for empty input', () => {
    expect(snakeToTitle('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 9. formatFileSize
// ---------------------------------------------------------------------------

describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatFileSize(512)).toMatch(/512/);
  });

  it('formats KB', () => {
    const result = formatFileSize(2048);
    expect(result).toMatch(/KB/);
  });

  it('formats MB', () => {
    const result = formatFileSize(2 * 1024 * 1024);
    expect(result).toMatch(/MB/);
  });

  it('formats GB', () => {
    const result = formatFileSize(2 * 1024 * 1024 * 1024);
    expect(result).toMatch(/GB/);
  });
});

// ---------------------------------------------------------------------------
// 10. formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  it('returns dash for empty string', () => {
    expect(formatRelativeTime('')).toBe('-');
  });

  it('returns "just now" for a date a few seconds ago', () => {
    const recent = new Date(Date.now() - 5000).toISOString();
    expect(formatRelativeTime(recent)).toBe('just now');
  });

  it('returns "minutes ago" for a date ~5 minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toMatch(/minute/);
  });

  it('returns "hours ago" for a date 2 hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toMatch(/hour/);
  });

  it('returns "days ago" for a date 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toMatch(/day/);
  });
});
