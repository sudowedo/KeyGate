import { useKeyGate } from '../contexts/KeyGateContext';

export default function ProjectSelectView({ go }) {
  const {
    projects, projectSearch, setProjectSearch,
    filteredProjects, showPlanBanner, setShowPlanBanner,
    projectToDelete, setProjectToDelete,
    deleteConfirm, setDeleteConfirm, deleteProject,
    notif, notify,
    ctx: { fmtDate },
  } = useKeyGate();

  const expectedDeleteText = projectToDelete ? `delete ${projectToDelete.slug}` : '';
  const canDeleteProject = projectToDelete && deleteConfirm.trim() === expectedDeleteText;

  const handleDelete = async () => {
    if (!canDeleteProject || !projectToDelete) return;
    try {
      const ps = await deleteProject();
      if (!ps.length) go('/console/new'); else go('/console');
    } catch (e) {
      notify(e.message || 'Failed to delete project', 'error');
    }
  };

  return (
    <div className='page active console-select-page'>
      <header className='console-landing-header'>
        <div>
          <h1>Projects Console</h1>
          <p>Create, switch, and manage isolated workspaces</p>
        </div>
        <div className='console-top-bar'>
          <div className='console-plan-badge'>
            <span className='console-plan-dot' /> Free plan <span>{projects.length} / 3 projects</span>
          </div>
          <button className='btn btn-primary console-create-btn' disabled={projects.length >= 3} onClick={() => go('/console/new')}>+ New project</button>
        </div>
      </header>

      <div className='console-select-content'>
        <div className='console-search-section'>
          <input
            className='projects-search console-search-input'
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            placeholder='Search by name, label, or ID'
          />
        </div>

        <div className={`card projects-banner console-info-banner ${showPlanBanner ? '' : 'hidden'}`}>
          <div className='console-banner-text'>Your Free plan includes up to 3 projects and limited resources.</div>
          <button className='btn btn-ghost btn-sm console-banner-link' style={{ marginTop: 8 }}>Upgrade to Pro</button>
          <button className='banner-close' onClick={() => setShowPlanBanner(false)} aria-label='Close banner'>✕</button>
        </div>

        <div className='console-project-count'>Total: <strong>{projects.length} / 3</strong> projects</div>

        <div className='projects-grid console-projects-grid'>
          {filteredProjects.map((p) => (
            <button key={p.id} className='card project-card console-project-card' onClick={() => go(`/console/${p.slug}/overview`)}>
              <div className='console-project-card-header'>
                <h3>{p.name}</h3>
                <span className={`badge ${p.status === 'active' ? 'active' : 'paused'}`}>{p.status}</span>
              </div>
              <div className='console-project-card-body'>
                <div className='console-project-id'>{p.slug}</div>
                <div className='console-project-date'>Created {fmtDate(p.created_at)}</div>
              </div>
              <div className='console-project-card-footer'>
                <span />
                <span className='project-delete console-project-delete' onClick={(e) => { e.stopPropagation(); setProjectToDelete(p); setDeleteConfirm(''); }}>Delete</span>
              </div>
            </button>
          ))}
        </div>

        <div className={`modal-backdrop ${projectToDelete ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setProjectToDelete(null)}>
          <div className='modal'>
            <div className='modal-title'>Delete project</div>
            <div className='danger-box'>
              This action is irreversible. All data related to this project will be deleted and issued keys will stop working.
            </div>
            <div className='field' style={{ marginTop: 12 }}>
              <label>Type "{expectedDeleteText}" to continue</label>
              <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='delete project-xxxx' />
            </div>
            <div className='modal-footer'>
              <button className='btn btn-ghost' onClick={() => setProjectToDelete(null)}>Cancel</button>
              <button className='btn btn-danger' disabled={!canDeleteProject} onClick={handleDelete}>Delete project permanently</button>
            </div>
          </div>
        </div>
        <div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div>
      </div>
    </div>
  );
}