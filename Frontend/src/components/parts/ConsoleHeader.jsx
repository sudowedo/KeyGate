import { LogoFull } from './Logo';
import { IconBell, IconMenu, IconExternal } from './Icons';

export default function ConsoleHeader({ page, selectedProject, projectSlug, onSwitchProject, onOpenMobileMenu, onOpenNotifications, mobileMenuOpen = false }) {
  const pageTitle = String(page || 'overview').replace(/^./, (m) => m.toUpperCase());

  return <header className='console-header app-shell-header'>
    <div className='app-shell-desktop'>
      <div className='logo app-shell-logo'>
        <LogoFull size={22} />
      </div>
      <div className='app-shell-project'>
        <div className='console-title'>{selectedProject?.name || 'Project'} <span style={{color:'var(--muted)',fontWeight:400}}>&bull;</span> {pageTitle}</div>
        <div className='console-sub'>{selectedProject?.slug || projectSlug} &middot; API Access Manager</div>
      </div>
      <button className='btn btn-ghost btn-sm app-shell-switch' onClick={onSwitchProject}><IconExternal width={14} height={14} /> Switch project</button>
    </div>

    <div className='mobile-appbar app-shell-mobile'>
      <button className={`mobile-icon-btn mobile-menu-toggle ${mobileMenuOpen ? 'active' : ''}`} onClick={onOpenMobileMenu} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenuOpen}>
        <IconMenu width={20} height={20} />
      </button>
      <div>
        <div className='mobile-brand'>KeyGate</div>
        <div className='mobile-shell-sub'>{pageTitle}</div>
      </div>
      <div className='mobile-appbar-actions'>
        <button className='mobile-icon-btn' onClick={onOpenNotifications} aria-label='Notifications'><IconBell width={20} height={20} /></button>
        <button className='mobile-avatar' onClick={onSwitchProject} aria-label='Back to console'>
          {selectedProject?.name?.charAt(0)?.toUpperCase() || 'K'}
        </button>
      </div>
    </div>
  </header>;
}