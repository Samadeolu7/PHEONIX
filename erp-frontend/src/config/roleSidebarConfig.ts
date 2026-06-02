/**
 * roleSidebarConfig.ts
 *
 * Per-role sidebar navigation config — storage utilities and role defaults.
 *
 * Storage model:
 *   key  → `ktil_role_nav_<normalized_role>`   (localStorage)
 *   value → JSON of `string[]`  (array of enabled button IDs)
 *
 * A leaf button is shown if its ID is in the enabled set.
 * A group button is shown automatically if any descendant leaf is enabled.
 */
import { HierarchyButton } from '../types';
import { DASHBOARD_SIDEBAR_CONFIG } from './dashboardSidebarConfig';

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
];

// ── Storage key ──────────────────────────────────────────────────────────────

const storageKey = (role: string): string =>
  `ktil_role_nav_${role.toLowerCase().replace(/\s+/g, '_')}`;

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
      return pickModules('btn-acct', 'btn-bank', 'btn-petty', 'btn-student');

    case 'HR Officer':
    case 'HR Manager':
      return pickModules('btn-hr');

    case 'Procurement Officer':
    case 'Store Officer':
      return pickModules('btn-proc', 'btn-inv');

    case 'Registrar':
      return pickModules('btn-student', 'btn-bank');

    default: // Officer and anything else
      return pickModules('btn-student', 'btn-bank');
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Get enabled IDs for a role (from localStorage, or the default). */
export function getEnabledIds(role: string): Set<string> {
  try {
    const saved = localStorage.getItem(storageKey(role));
    if (saved) {
      const arr = JSON.parse(saved) as string[];
      return new Set(arr);
    }
  } catch {
    /* ignore parse errors */
  }
  return defaultModuleIds(role);
}

/** Persist enabled IDs for a role. */
export function saveEnabledIds(role: string, ids: Set<string>): void {
  try {
    localStorage.setItem(storageKey(role), JSON.stringify([...ids]));
  } catch {
    /* ignore quota errors */
  }
}

/** Reset a role back to its defaults. */
export function resetEnabledIds(role: string): void {
  try {
    localStorage.removeItem(storageKey(role));
  } catch {
    /* ignore */
  }
}

/** Build the sidebar button tree for a role, filtered to enabled items. */
export function getRoleSidebarButtons(role: string): HierarchyButton[] {
  const ids = getEnabledIds(role);
  return filterButtons(DASHBOARD_SIDEBAR_CONFIG.buttons, ids);
}
