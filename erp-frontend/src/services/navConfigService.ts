/**
 * navConfigService.ts
 *
 * Talks to GET/PUT/DELETE /api/common/navigation/config/
 * and keeps a localStorage write-through cache so the sidebar
 * can render instantly from cache on every page load.
 */
import api from './api';

const CACHE_KEY = 'ktil_nav_config_cache';

/** Shape returned by the API: { "Credit Officer": ["leaf-x", ...], ... } */
type ServerConfig = Record<string, string[]>;

// ── Cache helpers ─────────────────────────────────────────────────────────────

function readCache(): ServerConfig {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ServerConfig) : {};
  } catch {
    return {};
  }
}

function writeCache(data: ServerConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch all configs from the server and update the local cache. */
async function fetchAll(): Promise<ServerConfig> {
  const res = await api.get('/common/navigation/config/');
  const data = (res.data ?? {}) as ServerConfig;
  writeCache(data);
  return data;
}

/**
 * Returns enabled IDs for a role from the local cache.
 * Call fetchAll() once on app boot to ensure the cache is fresh.
 * Returns null when no server config exists (caller should use its default).
 */
function getCached(role: string): string[] | null {
  const cache = readCache();
  return Object.prototype.hasOwnProperty.call(cache, role) ? cache[role] : null;
}

/** Save a role's config to the server, then refresh the local cache. */
async function save(role: string, enabledIds: string[]): Promise<void> {
  await api.put('/common/navigation/config/', { role, enabled_ids: enabledIds });
  // Update only this role in the cache
  const cache = readCache();
  cache[role] = enabledIds;
  writeCache(cache);
}

/** Delete a role's server config (reverts to frontend defaults). */
async function reset(role: string): Promise<void> {
  await api.delete('/common/navigation/config/', { data: { role } });
  const cache = readCache();
  delete cache[role];
  writeCache(cache);
}

export const navConfigService = { fetchAll, getCached, save, reset };
