/**
 * roleSidebarConfig.ts
 *
 * Per-role sidebar navigation config.
 *
 * Source of truth: server (via navConfigService / /api/common/navigation/config/).
 * Fast path: localStorage write-through cache (populated on app boot by AuthContext).
 *
 * A leaf button is shown if its ID is in the enabled set.
 * A group button is shown automatically if any descendant leaf is enabled.
 */
import { HierarchyButton } from '../types';
import { DASHBOARD_SIDEBAR_CONFIG } from './dashboardSidebarConfig';
import { navConfigService } from '../services/navConfigService';

// ── Constants ────────────────────────────────────────────────────────────────

/** Roles that can edit navigation config for all roles */
export const NAV_CONFIG_ROLES = ['Director', 'Principal'];

/** All known application roles (shown in the config page) */
export const ALL_ROLES = [
  'Director',
  'Principal',
  'Finance Officer',
  'Accountant',
  'HR Officer',
  'HR Manager',
  'Procurement Officer',
  'Store Officer',
  'Registrar',
  'Officer',
  'Credit Officer',
];

// (localStorage keys kept only as legacy fallback — server cache is the primary store)

// ── Tree traversal helpers ────────────────────────────────────────────────────

/** Collect every ID in a subtree (groups + leaves). */
export function collectAllIds(buttons: HierarchyButton[]): Set<string> {
  const ids = new Set<string>();
  function walk(btns: HierarchyButton[]) {
    for (const b of btns) {
      ids.add(b.id);
      if (b.children && b.children.length > 0) walk(b.children);
    }
  }
  walk(buttons);
  return ids;
}

/**
 * Filter the full config tree, keeping only nodes whose IDs are in `enabledIds`.
 * A group is included if at least one descendant leaf is enabled.
 */
export function filterButtons(
  buttons: HierarchyButton[],
  enabledIds: Set<string>
): HierarchyButton[] {
  const result: HierarchyButton[] = [];
  for (const btn of buttons) {
    const hasChildren = btn.children && btn.children.length > 0;
    if (hasChildren) {
      const filteredChildren = filterButtons(btn.children!, enabledIds);
      if (filteredChildren.length > 0) {
        result.push({ ...btn, children: filteredChildren });
      }
    } else {
      // Leaf: include if its ID (or the group) is in the enabled set
      if (enabledIds.has(btn.id)) {
        result.push(btn);
      }
    }
  }
  return result;
}

// ── Default IDs per role ──────────────────────────────────────────────────────

function defaultModuleIds(role: string): Set<string> {
  const full = DASHBOARD_SIDEBAR_CONFIG.buttons;

  /** Collect all IDs from the listed top-level group IDs */
  const pickModules = (...groupIds: string[]): Set<string> => {
    const picked = full.filter(b => groupIds.includes(b.id));
    return collectAllIds(picked);
  };

  switch (role) {
    case 'Director':
    case 'Principal':
      return collectAllIds(full); // everything

    case 'Finance Officer':
    case 'Accountant':
      return pickModules(
        'btn-acct', 'btn-bank', 'btn-recv', 'btn-ap', 'btn-petty', 'btn-student',
        'btn-savings', 'btn-loans',
      );

    case 'HR Officer':
    case 'HR Manager':
      return pickModules('btn-hr');

    case 'Procurement Officer':
      return pickModules('btn-proc', 'btn-ap', 'btn-inv');

    case 'Store Officer':
      return pickModules('btn-proc', 'btn-inv');

    case 'Registrar':
      return pickModules('btn-student', 'btn-bank');

    case 'Credit Officer':
    case 'Officer': {
      // Officers see clients, savings and loans — data is scoped server-side
      // to clients assigned to them. Cash Transfers is added individually
      // (not the whole btn-bank group) so they can post cashier-to-cashier
      // transfers without gaining visibility into bank accounts/payments/
      // inter-bank approvals, which stay director/finance-officer-only.
      const ids = pickModules('btn-student', 'btn-savings', 'btn-loans', 'btn-recv');
      ids.add('leaf-treasury-cash-transfers');
      return ids;
    }

    default:
      return pickModules('btn-student', 'btn-bank');
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get enabled IDs for a role.
 * Reads from the server cache (populated on app boot); falls back to hardcoded defaults.
 */
export function getEnabledIds(role: string): Set<string> {
  const cached = navConfigService.getCached(role);
  if (cached !== null) return new Set(cached);
  return defaultModuleIds(role);
}

/**
 * Persist enabled IDs for a role → server + local cache.
 * Returns a Promise so the config page can await it and show a success state.
 */
export function saveEnabledIds(role: string, ids: Set<string>): Promise<void> {
  return navConfigService.save(role, [...ids]);
}

/**
 * Reset a role back to its defaults → removes server record + clears local cache.
 * Returns a Promise.
 */
export function resetEnabledIds(role: string): Promise<void> {
  return navConfigService.reset(role);
}

/** Build the sidebar button tree for a role, filtered to enabled items. */
export function getRoleSidebarButtons(role: string): HierarchyButton[] {
  const ids = getEnabledIds(role);
  return filterButtons(DASHBOARD_SIDEBAR_CONFIG.buttons, ids);
}
