import { useEffect, useState } from 'react';

export default function useConsoleRouteState() {
  const [page, setPage] = useState('overview');
  const [view, setView] = useState('select');
  const [projectSlug, setProjectSlug] = useState('');
  const [isPublicHealth, setIsPublicHealth] = useState(false);

  const parsePath = () => {
    if (window.location.pathname === '/health') {
      setIsPublicHealth(true);
      setView('select');
      setProjectSlug('');
      setPage('health');
      return;
    }
    setIsPublicHealth(false);
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'console') {
      window.history.pushState({}, '', '/console');
      return parsePath();
    }
    if (!parts[1]) { setView('select'); setProjectSlug(''); setPage('overview'); return; }
    if (parts[1] === 'new') { setView('create'); setProjectSlug(''); setPage('overview'); return; }
    setView('console');
    setProjectSlug(parts[1]);
    setPage(parts[2] || 'overview');
  };

  const go = (path) => { window.history.pushState({}, '', path); parsePath(); };

  useEffect(() => {
    const h = () => parsePath();
    window.addEventListener('popstate', h);
    parsePath();
    return () => window.removeEventListener('popstate', h);
  }, []);

  return { page, view, projectSlug, go, isPublicHealth };
}
