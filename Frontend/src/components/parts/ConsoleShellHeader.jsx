export default function ConsoleShellHeader({
  isProjectView,
  project,
  projectSlug,
  page,
  projectsCount,
  searchValue,
  onSearchChange,
  onSwitchProject,
  onNewProject,
}) {
  const pageName = String(page || 'overview').replace(/^./, (m) => m.toUpperCase());
  return (
    <header className='console-shell-header'>
      <div className='console-shell-row'>
        <div>
          <div className='console-shell-title'>Projects Console</div>
          <div className='console-shell-sub'>
            {isProjectView
              ? `Console / ${project?.name || 'Project'} / ${pageName}`
              : 'Create, organize, and switch between isolated workspaces.'}
          </div>
          {isProjectView && <div className='console-shell-meta'>{project?.slug || projectSlug}</div>}
        </div>

        <div className='console-shell-actions'>
          {!isProjectView && (
            <input
              className='projects-search console-shell-search'
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder='Quick search projects'
            />
          )}
          {isProjectView && <button className='btn btn-ghost btn-sm' onClick={onSwitchProject}>Switch project</button>}
          <button className='btn btn-primary btn-sm' onClick={onNewProject}>+ New project</button>
          <button className='btn btn-ghost btn-sm' aria-label='User menu'>User</button>
        </div>
      </div>
      <div className='console-shell-secondary'>
        <span className='badge active'>Free plan</span>
        <span className='console-shell-secondary-text'>{projectsCount} / 3 projects · API healthy</span>
      </div>
    </header>
  );
}
