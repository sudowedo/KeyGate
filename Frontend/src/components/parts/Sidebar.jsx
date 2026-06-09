import { IconOverview, IconMasterKey, IconSubkey, IconLogs, IconDemo, IconHealth, IconNotifications, IconArrowLeft } from './Icons';

const items = [
  ['overview', 'Overview', IconOverview],
  ['masterkeys', 'Master keys', IconMasterKey],
  ['subkeys', 'Subkeys', IconSubkey],
  ['logs', 'Request logs', IconLogs],
  ['demo', 'Live demo', IconDemo],
  ['health', 'Health', IconHealth],
  ['notifications', 'Notifications', IconNotifications],
];

export default function Sidebar({ page, navigate, onBackToConsole, drawerOpen, setDrawerOpen }) {

  const go = (next) => {
    navigate(next);
    setDrawerOpen(false);
  };

  return <>
    <aside className='sidebar'>
      <nav className='nav'>
        <div className='nav-label'>Platform</div>
        {onBackToConsole && <button className='nav-item' onClick={onBackToConsole}><IconArrowLeft /> Back to console</button>}
        {items.map(([k, l, Icon]) => <button key={k} className={`nav-item ${page === k ? 'active' : ''}`} onClick={() => navigate(k)}><Icon /> {l}{k === 'demo' && <span className='nav-dot' />}</button>)}
      </nav>
      <div className='sidebar-footer'><div className='api-url-box'><div className='api-url-label'>Proxy endpoint</div><div className='api-url'>https://keygate-backend.onrender.com/</div></div></div>
    </aside>

    <div className={`mobile-drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setDrawerOpen(false)}>
      <aside className='mobile-drawer'>
        <div className='mobile-drawer-title'>KeyGate</div>
        <div className='mobile-drawer-list'>
          {items.map(([k, l, Icon]) => <button key={k} className={`mobile-drawer-item ${page === k ? 'active' : ''}`} onClick={() => go(k)}><Icon /> {l}</button>)}
        </div>
        <div className='mobile-drawer-footer'>https://keygate-backend.onrender.com/</div>
      </aside>
    </div>

    <nav className='mobile-tabbar' aria-label='Mobile navigation'>
      {items.slice(0, 5).map(([k, l, Icon]) => <button key={k} className={`mobile-tab ${page === k ? 'active' : ''}`} onClick={() => go(k)}><Icon width={18} height={18} /><span>{l.split(' ')[0]}</span></button>)}
    </nav>
  </>;
}