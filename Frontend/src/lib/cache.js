const KEY_PREFIX = 'kg_cache_';

// TTL per endpoint (ms). Shorter = more current, longer = fewer reads.
const TTL = {
  '/health':        24 * 60 * 60 * 1000, // 24 hr — one health check per day
  '/api/providers': 30 * 60 * 1000,      // 30 min — rarely changes
  '/api/projects':  5 * 60 * 1000,       // 5 min  — changes on create/delete
  '/api/master-keys': 2 * 60 * 1000,     // 2 min  — changes on create/revoke
  '/api/subkeys':   2 * 60 * 1000,       // 2 min  — changes on create/revoke
  '/api/analytics': 30 * 1000,           // 30 sec — changes every request
};

const DEFAULT_TTL = 60 * 1000; // 1 min fallback

function currentScope() {
  if (typeof window !== 'undefined' && window.__KEYGATE_CACHE_SCOPE) return window.__KEYGATE_CACHE_SCOPE;
  return 'public';
}

function safeScope(scope) {
  return String(scope || currentScope()).replace(/[^a-zA-Z0-9._:-]/g, '_');
}

function cacheKey(path, scope) {
  return `${KEY_PREFIX}${safeScope(scope)}:${path}`;
}

function ttlFor(path) {
  for (const [prefix, ms] of Object.entries(TTL)) {
    if (path.startsWith(prefix)) return ms;
  }
  return DEFAULT_TTL;
}

export function cacheGet(path, scope) {
  try {
    const raw = localStorage.getItem(cacheKey(path, scope));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > entry.ttl) {
      localStorage.removeItem(cacheKey(path, scope));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet(path, data, scope) {
  try {
    const entry = { data, ts: Date.now(), ttl: ttlFor(path) };
    localStorage.setItem(cacheKey(path, scope), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/** Bust exact path or any path starting with prefix for one cache scope. */
export function cacheBust(pathOrPrefix, scope) {
  try {
    const prefix = cacheKey(pathOrPrefix, scope);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX) && k.startsWith(prefix)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // silently skip
  }
}

/** Bust all kg_cache_ entries — call on logout, login, or hard reset. */
export function cacheClearAll() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // silently skip
  }
}

// ── Console helpers: callable from browser dev tools ──
if (typeof window !== 'undefined') {
  window.cacheClearAll = cacheClearAll;
  window.cacheBust = cacheBust;
  window.cacheGet = cacheGet;
  window.cacheScope = () => currentScope();
}

export function setCacheScope(scope) {
  if (typeof window !== 'undefined') window.__KEYGATE_CACHE_SCOPE = safeScope(scope || 'public');
}
