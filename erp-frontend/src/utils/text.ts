/**
 * text.ts — shared text-manipulation utilities
 *
 * Centralises helpers used across multiple components and services so they
 * stay in sync and are easy to test.
 */

/**
 * Strip leading emoji and surrounding whitespace from a string.
 *
 * Uses full Unicode property escapes (`\p{Emoji_Modifier}`,
 * `\p{Emoji_Component}`) so multi-code-point sequences such as family
 * emoji and flag pairs are handled correctly.
 *
 * @example
 *   stripLeadingEmoji('📋 Journal Vouchers') // → 'Journal Vouchers'
 *   stripLeadingEmoji('✨ New Feature')       // → 'New Feature'
 *   stripLeadingEmoji('Plain text')           // → 'Plain text'
 */
export const stripLeadingEmoji = (str: string): string =>
  str.replace(/^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\s]+/u, '').trim();
