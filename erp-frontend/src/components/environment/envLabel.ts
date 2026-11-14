/**
 * Environment label baked in at build time (VITE_ENV_LABEL). Production builds
 * leave it unset, so no banner renders there. The staging workflow
 * (.github/workflows/deploy-staging.yml) builds with VITE_ENV_LABEL=staging.
 */
export const ENV_LABEL: string = (import.meta.env.VITE_ENV_LABEL || '').trim().toLowerCase();

export const isNonProductionBuild = (label: string = ENV_LABEL): boolean =>
  label !== '' && label !== 'production' && label !== 'prod';

export const bannerText = (label: string = ENV_LABEL): string =>
  `${label.toUpperCase()} — test data only. Nothing here is real and no messages reach clients.`;
