import { useEffect } from 'react';
import { useKeyGate } from '../../contexts/KeyGateContext';

const PAGE_KEYS = ['overview', 'masterkeys', 'subkeys', 'logs', 'demo'];

export default function KeyboardShortcuts({ view, page, navigate }) {
  const { ctx: { modal, setModal }, projectToDelete, setProjectToDelete, notify } = useKeyGate();

  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (modal) { setModal(''); return; }
        if (projectToDelete) { setProjectToDelete(null); return; }
        return;
      }

      if (!isInput && (e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const search = document.querySelector('.projects-search, .console-search-input');
        if (search) { search.focus(); return; }
        notify('No search field available');
        return;
      }

      if (!isInput && !e.metaKey && !e.ctrlKey && ['1', '2', '3', '4', '5'].includes(e.key) && view === 'console') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (PAGE_KEYS[idx] && PAGE_KEYS[idx] !== page) navigate(PAGE_KEYS[idx]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, projectToDelete, page, view, navigate, notify]);

  return null;
}