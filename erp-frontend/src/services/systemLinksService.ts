/**
 * systemLinksService.ts  (updated)
 *
 * Single source of truth for all navigable links in the application.
 *
 * PRIMARY SOURCE: FEATURE_REGISTRY (featureRegistry.ts)
 *   - 150+ entries with granular permissions, rich descriptions,
 *     sub-categories, isNew/isEnhanced flags, and moduleId grouping.
 *
 * FALLBACK SOURCE: ROUTE_MAPPINGS (routeMapping.ts)
 *   - Catches any routes that exist in App.tsx but have not yet been
 *     added to the feature registry (detail/:id pages, admin-only routes,
 *     etc.).  Dynamic :param routes are excluded as before.
 *
 * All public lists are returned ALPHABETICALLY by title so the sidebar
 * link-picker is easy to scan without knowing where a feature lives.
 *
 * Public surface (unchanged for backwards compatibility):
 *   getSystemLinksFlat(role?)      — flat list, permission-aware, A→Z
 *   getSystemLinksGrouped(role?)   — grouped by module, each group A→Z
 *   searchSystemLinks(q, role?)    — client-side search, results A→Z
 *   systemLinksToModulePages()     — ModulePage shape for widget modals
 *
 *   fetchSystemLinksFlat(role?)    — async alias
 *   fetchSystemLinksGrouped(role?) — async alias
 *
 *   featureRegistryToModulePages() — NEW: converts FeatureCard[] directly
 *                                    to ModulePage[], sorted A→Z
 */

import { FEATURE_REGISTRY, FeatureCard } from '../config/featureRegistry';
import { ROUTE_MAPPINGS, RouteMapping } from '../utils/routeMapping';
import { UserRole, getRoleRank } from '../types/roles';
import { stripLeadingEmoji } from '../utils/text';

// ── Category display metadata ──────────────────────────────────────────────

const MODULE_META: Record<string, { icon: string; color: string; label: string }> = {
  financial: { icon: 'bar-chart', color: '#2563eb', label: 'Financial Management' },
  'client-services': { icon: 'graduation-cap', color: '#0891b2', label: 'Student Service' },
  operations: { icon: 'package', color: '#7c3aed', label: 'Operations' },
  administration: { icon: 'users', color: '#f97316', label: 'Administration' },
  // fallback for routeMapping categories
  'User Management': { icon: 'users', color: '#dc2626', label: 'User Management' },
  'Financial Operations': { icon: 'dollar-sign', color: '#16a34a', label: 'Financial Operations' },
  'Student Management': { icon: 'graduation-cap', color: '#2563eb', label: 'Student Management' },
  'Reports & Analytics': { icon: 'bar-chart-3', color: '#d97706', label: 'Reports & Analytics' },
  Operations: { icon: 'package', color: '#7c3aed', label: 'Operations' },
  'System Administration': { icon: 'settings', color: '#475569', label: 'System Administration' },
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface SystemLinkItem {
  code: string;
  title: string;
  description: string;
  url_path: string;
  icon: string;
  category: string; // machine key  e.g. "financial"
  category_label: string; // display name e.g. "Financial Management"
  category_color: string;
  sub_category?: string; // e.g. "Invoicing", "HR & Payroll"
  roles: UserRole[]; // empty [] when sourced from featureRegistry
  requiredPermission?: string;
  isNew?: boolean;
  isEnhanced?: boolean;
  isDeprecated?: boolean;
  source: 'registry' | 'routes'; // for debugging
}

export interface SystemLinkCategory {
  category: string;
  label: string;
  icon: string;
  color: string;
  links: SystemLinkItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const alphaByTitle = (a: SystemLinkItem, b: SystemLinkItem) => a.title.localeCompare(b.title);

const isStaticRoute = (r: RouteMapping) => !r.path.includes(':');

// Title-cleaning is provided by the shared stripLeadingEmoji utility (src/utils/text.ts).

// ── Convert FeatureCard → SystemLinkItem ───────────────────────────────────

function featureCardToLinkItem(f: FeatureCard): SystemLinkItem {
  const meta = MODULE_META[f.moduleId] ?? {
    icon: 'file-text',
    color: '#64748b',
    label: f.moduleId,
  };

  return {
    code: f.path.replace(/\//g, '-').replace(/^-/, ''),
    title: stripLeadingEmoji(f.title),
    description: f.description,
    url_path: f.path,
    icon: 'file-text',
    category: f.moduleId,
    category_label: meta.label,
    category_color: meta.color,
    sub_category: f.category,
    roles: [], // registry uses permissions, not roles
    requiredPermission: f.requiredPermission || undefined,
    isNew: f.isNew,
    isEnhanced: f.isEnhanced,
    isDeprecated: f.isDeprecated,
    source: 'registry',
  };
}

// ── Convert RouteMapping → SystemLinkItem (fallback only) ─────────────────

function routeToLinkItem(r: RouteMapping): SystemLinkItem {
  const meta = MODULE_META[r.category] ?? {
    icon: 'link',
    color: '#1a73e8',
    label: r.category,
  };
  return {
    code: r.path.replace(/\//g, '-').replace(/^-/, ''),
    title: r.title,
    description: r.description || r.title,
    url_path: r.path,
    icon: (r.icon ?? meta.icon).toLowerCase(),
    category: r.category.toLowerCase().replace(/[\s&]+/g, '_'),
    category_label: meta.label,
    category_color: meta.color,
    roles: r.roles,
    source: 'routes',
  };
}

// ── Build the merged, deduplicated link list ───────────────────────────────

function buildAllLinks(): SystemLinkItem[] {
  // 1. Start with every non-deprecated feature registry entry
  const registryLinks = FEATURE_REGISTRY.filter(f => !f.isDeprecated).map(featureCardToLinkItem);

  // 2. Collect paths already covered by the registry
  const registryPaths = new Set(registryLinks.map(l => l.url_path));

  // 3. Add static routes that the registry doesn't cover yet
  const seen = new Set<string>();
  const fallbackLinks: SystemLinkItem[] = [];

  for (const route of ROUTE_MAPPINGS) {
    if (!isStaticRoute(route)) continue;
    if (registryPaths.has(route.path)) continue; // already in registry
    if (seen.has(route.path)) continue; // dedupe within routes
    seen.add(route.path);
    fallbackLinks.push(routeToLinkItem(route));
  }

  return [...registryLinks, ...fallbackLinks];
}

// Memoised so repeated calls don't rebuild
let _cache: SystemLinkItem[] | null = null;
function getAllLinks(): SystemLinkItem[] {
  if (!_cache) _cache = buildAllLinks();
  return _cache;
}

// ── Permission / role filtering ────────────────────────────────────────────

/**
 * Returns true if the link should be visible to the given role.
 *
 * Registry links have no roles array — they rely on runtime permission
 * checks instead.  When used in the sidebar link-picker (where we want
 * to show Directors everything), pass role = 'Director'.
 *
 * For a runtime-permission-aware filter wrap the result yourself with
 * hasPermission(link.requiredPermission).
 */
function isVisibleToRole(link: SystemLinkItem, role: UserRole | null | undefined): boolean {
  // Rank 4+ (Principal, Director) see everything
  if (getRoleRank(role) >= 4) return true;

  // Registry links: no role filter here — caller handles permissions
  if (link.source === 'registry') return true;

  // Route-mapped fallback links: use the roles array
  if (link.roles.length === 0) return true;
  if (!role) return false;
  return link.roles.includes(role);
}

// ── Public synchronous API ─────────────────────────────────────────────────

/**
 * All navigable links, optionally filtered to those accessible by `role`.
 * Sorted A→Z by title.
 *
 * @param role         - Current user role (Director bypasses filtering)
 * @param hasPermission - Optional runtime permission checker. When supplied,
 *                        registry links without a matching permission are
 *                        excluded. Omit to show all links (e.g. in admin UI).
 */
export function getSystemLinksFlat(
  role?: UserRole | null,
  hasPermission?: (perm: string) => boolean
): SystemLinkItem[] {
  return getAllLinks()
    .filter(link => {
      if (!isVisibleToRole(link, role)) return false;
      // Apply granular permission filter when the caller supplies one
      if (hasPermission && link.requiredPermission) {
        if (getRoleRank(role) >= 4) return true; // rank 4+ bypass
        return hasPermission(link.requiredPermission);
      }
      return true;
    })
    .sort(alphaByTitle);
}

/**
 * Same as getSystemLinksFlat but grouped by module/category.
 * Each group's links are sorted A→Z; groups themselves are sorted A→Z.
 */
export function getSystemLinksGrouped(
  role?: UserRole | null,
  hasPermission?: (perm: string) => boolean
): SystemLinkCategory[] {
  const flat = getSystemLinksFlat(role, hasPermission);
  const byCategory = new Map<string, SystemLinkCategory>();

  for (const link of flat) {
    if (!byCategory.has(link.category)) {
      const meta = MODULE_META[link.category] ??
        MODULE_META[link.category_label] ?? { icon: 'folder', color: '#1a73e8' };
      byCategory.set(link.category, {
        category: link.category,
        label: link.category_label,
        icon: meta.icon,
        color: meta.color,
        links: [],
      });
    }
    byCategory.get(link.category)!.links.push(link);
  }

  // Each group is already A→Z (inherited from flat sort).
  // Sort groups themselves A→Z by label.
  return Array.from(byCategory.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Client-side search across title, description, sub_category, and url_path.
 * Results are sorted A→Z.
 */
export function searchSystemLinks(
  query: string,
  role?: UserRole | null,
  hasPermission?: (perm: string) => boolean
): SystemLinkItem[] {
  if (!query.trim()) return getSystemLinksFlat(role, hasPermission);
  const q = query.toLowerCase();
  return getSystemLinksFlat(role, hasPermission).filter(
    l =>
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      (l.sub_category ?? '').toLowerCase().includes(q) ||
      l.url_path.toLowerCase().includes(q)
  );
}

// ── Async aliases (backwards-compatible) ──────────────────────────────────

export async function fetchSystemLinksFlat(
  role?: UserRole | null,
  hasPermission?: (perm: string) => boolean
): Promise<SystemLinkItem[]> {
  return getSystemLinksFlat(role, hasPermission);
}

export async function fetchSystemLinksGrouped(
  role?: UserRole | null,
  hasPermission?: (perm: string) => boolean
): Promise<SystemLinkCategory[]> {
  return getSystemLinksGrouped(role, hasPermission);
}

// ── ModulePage adapters ────────────────────────────────────────────────────

/**
 * Convert SystemLinkItems to the ModulePage shape expected by
 * SidebarWidgetConfigModal and QuickLinksConfigStyled.
 * Results are sorted A→Z by title.
 */
export function systemLinksToModulePages(links: SystemLinkItem[]) {
  return [...links]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(link => ({
      id: link.code,
      code: link.code,
      title: link.title,
      description: link.description,
      url_path: link.url_path,
      page_type: 'custom' as const,
      page_config: { frontend_url: link.url_path },
      icon: link.icon,
      category: link.sub_category ?? link.category_label,
      module: link.category_label,
      isNew: link.isNew,
      isEnhanced: link.isEnhanced,
    }));
}

/**
 * NEW — Convert FeatureCard[] directly to ModulePage[] without going
 * through SystemLinkItem. Use this when you want the full registry,
 * optionally filtered by module or permission.
 *
 * @param options.moduleId      - Filter to one module (e.g. "financial")
 * @param options.hasPermission - Runtime permission checker
 * @param options.role          - Current role (Director bypasses permission)
 * @param options.includeDeprecated - Default false
 */
export function featureRegistryToModulePages(
  options: {
    moduleId?: string;
    hasPermission?: (perm: string) => boolean;
    role?: UserRole | null;
    includeDeprecated?: boolean;
  } = {}
) {
  const { moduleId, hasPermission, role, includeDeprecated = false } = options;

  const isSuperUser = getRoleRank(role) >= 4;

  return (
    FEATURE_REGISTRY.filter(f => {
      if (!includeDeprecated && f.isDeprecated) return false;
      if (moduleId && f.moduleId !== moduleId) return false;
      if (!isSuperUser && hasPermission && f.requiredPermission) {
        return hasPermission(f.requiredPermission);
      }
      return true;
    })
      .map(f => ({
        id: f.path.replace(/\//g, '-').replace(/^-/, ''),
        code: f.path.replace(/\//g, '-').replace(/^-/, ''),
        title: stripLeadingEmoji(f.title),
        description: f.description,
        url_path: f.path,
        page_type: 'custom' as const,
        page_config: { frontend_url: f.path },
        icon: 'file-text',
        category: f.category, // sub-category e.g. "Invoicing"
        module: MODULE_META[f.moduleId]?.label ?? f.moduleId,
        isNew: f.isNew,
        isEnhanced: f.isEnhanced,
      }))
      // A→Z by title, emoji-stripped
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}
