/**
 * Decimal arithmetic utilities for financial calculations.
 * Uses decimal.js to avoid IEEE 754 floating-point precision errors.
 *
 * USAGE:
 *   import { toDecimal, addDecimals, mulDecimals, sumDecimals } from '@/utils/decimal';
 *
 *   const total = sumDecimals([item1.amount, item2.amount, item3.amount]);
 *   const cost  = mulDecimals(quantity, unitPrice);
 */

import Decimal from 'decimal.js';

// Alias for the instance type — the `Decimal` class constructor doubles as a type
type DecimalInstance = InstanceType<typeof Decimal>;

/** Acceptable input types for decimal operations */
export type DecimalInput = string | number | DecimalInstance | null | undefined;

/** Convert any value (string | number | Decimal | null | undefined) to a Decimal safely. */
export function toDecimal(value: DecimalInput): DecimalInstance {
  if (value == null || value === '') return new Decimal(0);
  try {
    return new Decimal(value as string | number | DecimalInstance);
  } catch {
    return new Decimal(0);
  }
}

/** Add two decimal-compatible values. Returns a Decimal. */
export function addDecimals(a: DecimalInput, b: DecimalInput): DecimalInstance {
  return toDecimal(a).plus(toDecimal(b));
}

/** Subtract b from a. Returns a Decimal. */
export function subDecimals(a: DecimalInput, b: DecimalInput): DecimalInstance {
  return toDecimal(a).minus(toDecimal(b));
}

/** Multiply two decimal-compatible values. Returns a Decimal. */
export function mulDecimals(a: DecimalInput, b: DecimalInput): DecimalInstance {
  return toDecimal(a).times(toDecimal(b));
}

/** Divide a by b. Returns Decimal(0) when b is zero. */
export function divDecimals(a: DecimalInput, b: DecimalInput): DecimalInstance {
  const divisor = toDecimal(b);
  if (divisor.isZero()) return new Decimal(0);
  return toDecimal(a).dividedBy(divisor);
}

/** Sum an array of decimal-compatible values. Returns a Decimal. */
export function sumDecimals(values: DecimalInput[]): DecimalInstance {
  return values.reduce<DecimalInstance>(
    (acc, v) => acc.plus(toDecimal(v)),
    new Decimal(0)
  );
}

/**
 * Format a Decimal (or any compatible value) as a fixed decimal string with
 * the given number of decimal places, using ROUND_HALF_UP.
 *
 * @example decimalToFixed("1234.565", 2) → "1234.57"
 */
export function decimalToFixed(value: DecimalInput, dp = 2): string {
  return toDecimal(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
}

/**
 * Convert a Decimal to a plain JS number only when required by a third-party
 * API (e.g. Intl.NumberFormat). Never use for arithmetic.
 */
export function decimalToNumber(value: DecimalInput): number {
  return toDecimal(value).toNumber();
}

export { Decimal };
