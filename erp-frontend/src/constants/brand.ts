/**
 * Krystar Trust Investment Limited (KTIL)
 * Brand Constants
 *
 * Colour palette sourced directly from the official KTIL logo SVG:
 * - Deep Navy  #0a1857 — primary brand colour (logo square background)
 * - Antique Gold #b79758 — accent colour (logo text and K-symbol bars)
 */

export const BRAND = {
  // ── Identity ──────────────────────────────────────────────────────────────
  companyName: 'Krystar Trust Investment Limited',
  shortName: 'KTIL',
  motto: 'Building Trust, Growing Wealth',
  tagline: 'Loans • Savings • Investments • Growth',
  systemLabel: 'Krystar Trust ERP',
  govtApproved: 'CBN Compliant',

  // ── Assets (relative to /public) ──────────────────────────────────────────
  logoUrl: '/KTILogo.svg',
  buildingImageUrl: '/WEB7.png',
  leadershipBannerUrl: '/WEBB2.png',

  // ── Colour Palette (from official KTIL logo SVG) ──────────────────────────
  colors: {
    navyPrimary: '#0a1857', // deep navy — main brand colour (logo background)
    navyDark:    '#060e30', // darker navy for hover / depth
    navyLight:   '#162570', // lighter navy for gradients
    gold:        '#b79758', // antique gold — accent colour (logo text & bars)
    goldLight:   '#dfc99a', // light gold tint for backgrounds
    goldDark:    '#8a6e3a', // deep gold for text on light bg
    red:         '#CC1414', // alert / warning accent
    redLight:    '#FEE2E2',
    white:       '#FFFFFF',
    offWhite:    '#F8F6F0', // warm off-white app background
    textPrimary:    '#0a1857', // navy for headings
    textSecondary:  '#3d5080', // muted navy for body text
    border:         '#c8aa78', // warm gold-tinted border
  },

  // ── Role colour overrides ──────────────────────────────────────────────────
  roleColors: {
    Director:      { primary: '#0a1857', accent: '#162570' },
    Principal:     { primary: '#1a5c3a', accent: '#1e8a57' },
    Administrator: { primary: '#4a1a7a', accent: '#6d28d9' },
    Registrar:     { primary: '#7a3010', accent: '#c2410c' },
    Officer:       { primary: '#0e4d6e', accent: '#0891b2' },
  },
} as const;
