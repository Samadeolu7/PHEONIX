/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add other env variables here

  // ── Brand overrides (all optional — see .env.example) ──────────────────
  readonly VITE_BRAND_COMPANY_NAME?: string;
  readonly VITE_BRAND_SHORT_NAME?: string;
  readonly VITE_BRAND_MOTTO?: string;
  readonly VITE_BRAND_TAGLINE?: string;
  readonly VITE_BRAND_SYSTEM_LABEL?: string;
  readonly VITE_BRAND_GOVT_APPROVED?: string;
  readonly VITE_BRAND_LOGO_URL?: string;
  readonly VITE_BRAND_BUILDING_IMAGE_URL?: string;
  readonly VITE_BRAND_COLOR_NAVY_PRIMARY?: string;
  readonly VITE_BRAND_COLOR_NAVY_DARK?: string;
  readonly VITE_BRAND_COLOR_NAVY_LIGHT?: string;
  readonly VITE_BRAND_COLOR_GOLD?: string;
  readonly VITE_BRAND_COLOR_GOLD_LIGHT?: string;
  readonly VITE_BRAND_COLOR_GOLD_DARK?: string;
  readonly VITE_BRAND_COLOR_RED?: string;
  readonly VITE_BRAND_COLOR_RED_LIGHT?: string;
  readonly VITE_BRAND_COLOR_WHITE?: string;
  readonly VITE_BRAND_COLOR_OFF_WHITE?: string;
  readonly VITE_BRAND_COLOR_TEXT_PRIMARY?: string;
  readonly VITE_BRAND_COLOR_TEXT_SECONDARY?: string;
  readonly VITE_BRAND_COLOR_BORDER?: string;
  readonly VITE_BRAND_ROLE_DIRECTOR_PRIMARY?: string;
  readonly VITE_BRAND_ROLE_DIRECTOR_ACCENT?: string;
  readonly VITE_BRAND_ROLE_PRINCIPAL_PRIMARY?: string;
  readonly VITE_BRAND_ROLE_PRINCIPAL_ACCENT?: string;
  readonly VITE_BRAND_ROLE_ADMINISTRATOR_PRIMARY?: string;
  readonly VITE_BRAND_ROLE_ADMINISTRATOR_ACCENT?: string;
  readonly VITE_BRAND_ROLE_REGISTRAR_PRIMARY?: string;
  readonly VITE_BRAND_ROLE_REGISTRAR_ACCENT?: string;
  readonly VITE_BRAND_ROLE_OFFICER_PRIMARY?: string;
  readonly VITE_BRAND_ROLE_OFFICER_ACCENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
