import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { cacheGet, cacheSet, cacheBust } from '../lib/cache';

const CTX = createContext(null);
export const useKeyGate = () => useContext(CTX);

const API = import.meta.env.VITE_API_URL || 'https://keygate-backend.onrender.com';
export const fmtNum = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
export const fmtTime = (ts) => (!ts ? '—' : new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
export const fmtDate = (ts) => (!ts ? 'Never' : new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }));
export const quotaColor = (used, limit) => (((used / limit) * 100 > 90) ? 'over' : ((used / limit) * 100 > 70) ? 'warn' : 'ok');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const VALID_PAGES = ['overview', 'masterkeys', 'subkeys', 'logs', 'demo', 'health', 'notifications'];

export default function KeyGateProvider({ children, projectSlug, page }) {
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showPlanBanner, setShowPlanBanner] = useState(true);
  const [subkeys, setSubkeys] = useState([]);
  const [masterKeys, setMasterKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState({ totalRequests: 0, totalTokens: 0, avgLatency: '—', logs: [] });
  const [notif, setNotif] = useState({ show: false, msg: '', type: 'success' });
  const [modal, setModal] = useState('');
  const [revealedToken, setRevealedToken] = useState('—');
  const [providers, setProviders] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState({ overview: true, masterkeys: true, subkeys: true, logs: true });
  const [copiedItem, setCopiedItem] = useState('');

  const notify = (msg, type = 'success') => { setNotif({ show: true, msg, type }); setTimeout(() => setNotif((v) => ({ ...v, show: false })), 3000); };

  const copyText = async (text, id = '') => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) { setCopiedItem(id); setTimeout(() => setCopiedItem((v) => v === id ? '' : v), 1600); }
      else notify('Copied to clipboard');
    } catch { notify('Failed to copy', 'error'); }
  };

  const api = async (path, opts = {}) => {
    const hasBody = opts.body !== undefined;
    const method = (opts.method || 'GET').toUpperCase();
    const isRead = method === 'GET';
    const headers = {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(projectSlug ? { 'x-project-id': projectSlug } : {}),
      ...opts.headers
    };

    // Return cached GET data if fresh
    if (isRead) {
      const cached = cacheGet(path);
      if (cached !== null) return cached;
    }

    const res = await fetch(API + path, { ...opts, method, headers, body: hasBody ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
      err.code = data?.error?.code || null;
      throw err;
    }

    // Cache successful reads; bust on mutations
    if (isRead) {
      cacheSet(path, data);
    } else {
      cacheBust(path);
      // Bust parent too for nested paths (e.g. POST /api/health/refresh-now
      // should also invalidate cached GET /api/health)
      const segments = path.split('/').filter(Boolean);
      if (segments.length > 2) {
        cacheBust('/' + segments.slice(0, -1).join('/'));
      }
    }

    return data;
  };

  const loadProviders = async () => {
    const res = await api('/api/providers', { headers: {} });
    setProviders(res.providers || []);
    return res.providers || [];
  };

  const loadProjects = async () => {
    const rows = await api('/api/projects', { headers: {} });
    setProjects(rows);
    return rows;
  };

  const loadOverview = async () => {
    cacheBust('/api/subkeys');
    cacheBust('/api/analytics');
    setLoading((v) => ({ ...v, overview: true }));
    try {
      const [sks, an] = await Promise.all([api('/api/subkeys'), api('/api/analytics')]);
      setSubkeys(sks);
      setLogs(an.logs || []);
      setAnalytics(an);
    } finally {
      setLoading((v) => ({ ...v, overview: false }));
    }
  };

  const loadMasterKeys = async () => {
    cacheBust('/api/master-keys');
    setLoading((v) => ({ ...v, masterkeys: true }));
    try { setMasterKeys(await api('/api/master-keys')); }
    finally { setLoading((v) => ({ ...v, masterkeys: false })); }
  };

  const loadSubkeys = async () => {
    cacheBust('/api/subkeys');
    setLoading((v) => ({ ...v, subkeys: true }));
    try { setSubkeys(await api('/api/subkeys')); }
    finally { setLoading((v) => ({ ...v, subkeys: false })); }
  };

  const loadLogs = async () => {
    cacheBust('/api/analytics');
    setLoading((v) => ({ ...v, logs: true }));
    try {
      const an = await api('/api/analytics');
      setLogs(an.logs || []);
      setAnalytics(an);
    } finally {
      setLoading((v) => ({ ...v, logs: false }));
    }
  };

  const createProject = async (name) => {
    if (projects.length >= 3) { notify('Maximum 3 projects allowed for now', 'error'); return null; }
    const p = await api('/api/projects', { method: 'POST', body: { name }, headers: {} });
    await loadProjects();
    return p;
  };

  const deleteProject = async () => {
    if (!projectToDelete) return;
    const ref = encodeURIComponent(projectToDelete.slug || projectToDelete.id);
    const attempts = [
      { path: `/api/projects/by-slug/${ref}`, method: 'DELETE' },
      { path: `/api/projects/${encodeURIComponent(projectToDelete.id)}`, method: 'DELETE' },
    ];
    let deleted = false;
    for (const attempt of attempts) {
      const res = await fetch(API + attempt.path, { method: attempt.method });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data?.success !== false)) { deleted = true; break; }
    }
    if (!deleted) throw new Error('Failed to delete project');
    cacheBust('/api/projects');
    setDeleteConfirm('');
    setProjectToDelete(null);
    notify('Project deleted');
    const ps = await loadProjects();
    return ps;
  };

  useEffect(() => {
    if (!projectSlug) return;
    if (page === 'overview') loadOverview().catch((e) => notify(e.message, 'error'));
    if (page === 'masterkeys') loadMasterKeys().catch((e) => notify(e.message, 'error'));
    if (page === 'subkeys') loadSubkeys().catch((e) => notify(e.message, 'error'));
    if (page === 'logs') loadLogs().catch((e) => notify(e.message, 'error'));
    if (page === 'demo' || page === 'notifications') {
      loadSubkeys().catch((e) => notify(e.message, 'error'));
      setLoading((v) => ({ ...v, subkeys: true }));
    }
  }, [page, projectSlug]);

  // Reset subkey loading when data arrives for demo/notifications
  useEffect(() => {
    if (page === 'demo' || page === 'notifications') {
      if (subkeys.length > 0) setLoading((v) => ({ ...v, subkeys: false }));
    }
  }, [subkeys, page]);

  // Auto-refresh on tab focus — catches external API requests
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!projectSlug) return;
      if (page === 'overview') loadOverview().catch(() => {});
      else if (page === 'masterkeys') loadMasterKeys().catch(() => {});
      else if (page === 'subkeys') loadSubkeys().catch(() => {});
      else if (page === 'logs') loadLogs().catch(() => {});
      else if (page === 'demo' || page === 'notifications') loadSubkeys().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [page, projectSlug]);

  const ctx = useMemo(() => ({
    API, providers, loadProviders, fmtNum, fmtTime, fmtDate, quotaColor, sleep,
    api, notify, copyText, modal, setModal, revealedToken, setRevealedToken,
    loadMasterKeys, loadSubkeys, loadLogs, loadOverview,
    subkeys, setSubkeys, masterKeys, logs, analytics, page, loading, copiedItem,
  }), [modal, subkeys, masterKeys, logs, analytics, revealedToken, page, projectSlug, providers, loading, copiedItem]);

  const value = useMemo(() => ({
    ctx,
    projects, projectName, setProjectName,
    projectSearch, setProjectSearch, projectToDelete, setProjectToDelete,
    deleteConfirm, setDeleteConfirm, showPlanBanner, setShowPlanBanner,
    mobileMenuOpen, setMobileMenuOpen,
    notif,
    createProject, deleteProject, loadProviders, loadProjects, notify,
    filteredProjects: projects.filter((p) =>
      `${p.name} ${p.slug} ${p.id}`.toLowerCase().includes(projectSearch.toLowerCase())
    ),
    selectedProject: projects.find((p) => p.slug === projectSlug || p.id === projectSlug),
  }), [ctx, projects, projectName, projectSearch, projectToDelete, deleteConfirm, showPlanBanner, mobileMenuOpen, notif, projectSlug]);

  return <CTX.Provider value={value}>{children}</CTX.Provider>;
}