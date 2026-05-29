/**
 * src/__tests__/unit/validation.test.ts
 *
 * Unit tests for the validation utility rules used in every form
 * across the Phoenix ERP UI.
 *
 * Covers:
 *  1. required          — string, array, null/undefined
 *  2. minLength         — at-limit, below, empty (pass-through)
 *  3. maxLength         — at-limit, above, empty (pass-through)
 *  4. email             — valid, invalid, empty (optional field)
 *  5. phone             — valid Nigerian number, invalid, empty
 *  6. number            — numeric string, NaN string, 0
 *  7. positiveNumber    — positive, zero (fail), negative (fail)
 *  8. nonNegativeNumber — zero (pass), negative (fail)
 *  9. minValue          — at-limit, below
 * 10. maxValue          — at-limit, above
 */

import { describe, it, expect } from 'vitest';
import { validationRules } from '../../utils/validation';

// ---------------------------------------------------------------------------
// 1. required
// ---------------------------------------------------------------------------

describe('validationRules.required', () => {
  const rule = validationRules.required();

  it('passes for a non-empty string', () => {
    expect(rule.validate('hello')).toBe(true);
  });

  it('fails for an empty string', () => {
    expect(rule.validate('')).toBe(false);
  });

  it('fails for a whitespace-only string', () => {
    expect(rule.validate('   ')).toBe(false);
  });

  it('fails for null', () => {
    expect(rule.validate(null)).toBe(false);
  });

  it('fails for undefined', () => {
    expect(rule.validate(undefined)).toBe(false);
  });

  it('passes for a non-empty array', () => {
    expect(rule.validate([1, 2])).toBe(true);
  });

  it('fails for an empty array', () => {
    expect(rule.validate([])).toBe(false);
  });

  it('passes for zero (numeric)', () => {
    expect(rule.validate(0)).toBe(true);
  });

  it('uses custom message', () => {
    const custom = validationRules.required('Field is mandatory');
    expect(custom.message).toBe('Field is mandatory');
  });
});

// ---------------------------------------------------------------------------
// 2. minLength
// ---------------------------------------------------------------------------

describe('validationRules.minLength', () => {
  const rule = validationRules.minLength(5);

  it('passes when string meets minimum length', () => {
    expect(rule.validate('hello')).toBe(true);
  });

  it('passes when string exceeds minimum length', () => {
    expect(rule.validate('hello world')).toBe(true);
  });

  it('fails when string is below minimum length', () => {
    expect(rule.validate('hi')).toBe(false);
  });

  it('passes for empty string (optional field pass-through)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. maxLength
// ---------------------------------------------------------------------------

describe('validationRules.maxLength', () => {
  const rule = validationRules.maxLength(10);

  it('passes when string is within max length', () => {
    expect(rule.validate('short')).toBe(true);
  });

  it('passes when string equals max length', () => {
    expect(rule.validate('1234567890')).toBe(true);
  });

  it('fails when string exceeds max length', () => {
    expect(rule.validate('12345678901')).toBe(false);
  });

  it('passes for empty string', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. email
// ---------------------------------------------------------------------------

describe('validationRules.email', () => {
  const rule = validationRules.email();

  it('passes for a valid email address', () => {
    expect(rule.validate('user@example.com')).toBe(true);
  });

  it('passes for a subdomain email', () => {
    expect(rule.validate('admin@mail.phoenix.ng')).toBe(true);
  });

  it('fails for an email without @', () => {
    expect(rule.validate('notanemail')).toBe(false);
  });

  it('fails for an email without domain', () => {
    expect(rule.validate('user@')).toBe(false);
  });

  it('passes for empty string (optional field)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. phone
// ---------------------------------------------------------------------------

describe('validationRules.phone', () => {
  // Regex: /^[\+]?[1-9][\d]{0,15}$/  — must start with [1-9] (no leading 0)
  const rule = validationRules.phone();

  it('passes for a number starting with a non-zero digit', () => {
    // 8012345678 starts with 8 → valid
    expect(rule.validate('8012345678')).toBe(true);
  });

  it('passes for international format', () => {
    expect(rule.validate('+2348012345678')).toBe(true);
  });

  it('fails for a number starting with 0 (Nigerian format requires stripping country code)', () => {
    // Regex requires first char to be [1-9]
    expect(rule.validate('08012345678')).toBe(false);
  });

  it('fails for non-numeric characters', () => {
    expect(rule.validate('abcdefg')).toBe(false);
  });

  it('passes for empty string (optional field)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. number
// ---------------------------------------------------------------------------

describe('validationRules.number', () => {
  const rule = validationRules.number();

  it('passes for a numeric string', () => {
    expect(rule.validate('42')).toBe(true);
  });

  it('passes for a numeric value of 0', () => {
    expect(rule.validate(0)).toBe(true);
  });

  it('passes for a decimal string', () => {
    expect(rule.validate('3.14')).toBe(true);
  });

  it('fails for a non-numeric string', () => {
    expect(rule.validate('abc')).toBe(false);
  });

  it('passes for empty string (optional)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. positiveNumber
// ---------------------------------------------------------------------------

describe('validationRules.positiveNumber', () => {
  const rule = validationRules.positiveNumber();

  it('passes for a positive number', () => {
    expect(rule.validate(100)).toBe(true);
  });

  it('passes for a positive decimal string', () => {
    expect(rule.validate('0.01')).toBe(true);
  });

  it('fails for zero', () => {
    expect(rule.validate(0)).toBe(false);
  });

  it('fails for a negative number', () => {
    expect(rule.validate(-5)).toBe(false);
  });

  it('passes for empty string (optional field)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. nonNegativeNumber
// ---------------------------------------------------------------------------

describe('validationRules.nonNegativeNumber', () => {
  const rule = validationRules.nonNegativeNumber();

  it('passes for zero', () => {
    expect(rule.validate(0)).toBe(true);
  });

  it('passes for a positive number', () => {
    expect(rule.validate(50)).toBe(true);
  });

  it('fails for a negative number', () => {
    expect(rule.validate(-1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. minValue
// ---------------------------------------------------------------------------

describe('validationRules.minValue', () => {
  const rule = validationRules.minValue(100);

  it('passes for a value exactly at the minimum', () => {
    expect(rule.validate(100)).toBe(true);
  });

  it('passes for a value above the minimum', () => {
    expect(rule.validate(500)).toBe(true);
  });

  it('fails for a value below the minimum', () => {
    expect(rule.validate(99)).toBe(false);
  });

  it('passes for empty string (optional)', () => {
    expect(rule.validate('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. maxValue
// ---------------------------------------------------------------------------

describe('validationRules.maxValue', () => {
  const rule = validationRules.maxValue(1000);

  it('passes for a value at the maximum', () => {
    expect(rule.validate(1000)).toBe(true);
  });

  it('passes for a value below the maximum', () => {
    expect(rule.validate(500)).toBe(true);
  });

  it('fails for a value above the maximum', () => {
    expect(rule.validate(1001)).toBe(false);
  });

  it('passes for empty string (optional)', () => {
    expect(rule.validate('')).toBe(true);
  });
});
