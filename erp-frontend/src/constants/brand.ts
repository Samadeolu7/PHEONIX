/**
 * Brand Constants
 *
 * All values are overridable via VITE_BRAND_* environment variables
 * (see .env.example), so this file can be reused across deployments
 * without code changes. Defaults below match the KTIL brand.
 */

const env = import.meta.env;

export const BRAND = {
  // ── Identity ──────────────────────────────────────────────────────────────
  companyName: env.VITE_BRAND_COMPANY_NAME || 'Example finance investment limited',
  shortName: env.VITE_BRAND_SHORT_NAME || 'KTIL',
  motto: env.VITE_BRAND_MOTTO || 'Building Trust, Growing Wealth',
  tagline: env.VITE_BRAND_TAGLINE || 'Loans • Savings • Investments • Growth',
  systemLabel: env.VITE_BRAND_SYSTEM_LABEL || 'Example finance ERP',
  govtApproved: env.VITE_BRAND_GOVT_APPROVED || 'CBN Compliant',

  // ── Assets (relative to /public) ──────────────────────────────────────────
  logoUrl: env.VITE_BRAND_LOGO_URL || '/KTILogo.svg',
  buildingImageUrl: env.VITE_BRAND_BUILDING_IMAGE_URL || '/WEB7.png',

  // ── Colour Palette ───────────────────────────────────────────────────────
  colors: {
    navyPrimary: env.VITE_BRAND_COLOR_NAVY_PRIMARY || '#0a1857', // main brand colour
    navyDark: env.VITE_BRAND_COLOR_NAVY_DARK || '#060e30', // darker navy for hover / depth
    navyLight: env.VITE_BRAND_COLOR_NAVY_LIGHT || '#162570', // lighter navy for gradients
    gold: env.VITE_BRAND_COLOR_GOLD || '#b79758', // accent colour
    goldLight: env.VITE_BRAND_COLOR_GOLD_LIGHT || '#dfc99a', // light gold tint for backgrounds
    goldDark: env.VITE_BRAND_COLOR_GOLD_DARK || '#8a6e3a', // deep gold for text on light bg
    red: env.VITE_BRAND_COLOR_RED || '#CC1414', // alert / warning accent
    redLight: env.VITE_BRAND_COLOR_RED_LIGHT || '#FEE2E2',
    white: env.VITE_BRAND_COLOR_WHITE || '#FFFFFF',
    offWhite: env.VITE_BRAND_COLOR_OFF_WHITE || '#F8F6F0', // app background
    textPrimary: env.VITE_BRAND_COLOR_TEXT_PRIMARY || '#0a1857', // headings
    textSecondary: env.VITE_BRAND_COLOR_TEXT_SECONDARY || '#3d5080', // body text
    border: env.VITE_BRAND_COLOR_BORDER || '#c8aa78',
  },

  // ── Role colour overrides ──────────────────────────────────────────────────
  roleColors: {
    Director: {
      primary: env.VITE_BRAND_ROLE_DIRECTOR_PRIMARY || '#0a1857',
      accent: env.VITE_BRAND_ROLE_DIRECTOR_ACCENT || '#162570',
    },
    Principal: {
      primary: env.VITE_BRAND_ROLE_PRINCIPAL_PRIMARY || '#1a5c3a',
      accent: env.VITE_BRAND_ROLE_PRINCIPAL_ACCENT || '#1e8a57',
    },
    Administrator: {
      primary: env.VITE_BRAND_ROLE_ADMINISTRATOR_PRIMARY || '#4a1a7a',
      accent: env.VITE_BRAND_ROLE_ADMINISTRATOR_ACCENT || '#6d28d9',
    },
    Registrar: {
      primary: env.VITE_BRAND_ROLE_REGISTRAR_PRIMARY || '#7a3010',
      accent: env.VITE_BRAND_ROLE_REGISTRAR_ACCENT || '#c2410c',
    },
    Officer: {
      primary: env.VITE_BRAND_ROLE_OFFICER_PRIMARY || '#0e4d6e',
      accent: env.VITE_BRAND_ROLE_OFFICER_ACCENT || '#0891b2',
    },
  },
} as const;
