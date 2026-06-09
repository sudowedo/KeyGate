import { useState } from 'react';
import { useKeyGate } from '../contexts/KeyGateContext';

export default function CreateProjectView({ go }) {
  const { createProject, notif } = useKeyGate();
  const [projectName, setProjectName] = useState('');

  const handleCreate = async () => {
    const p = await createProject(projectName);
    if (p) {
      setProjectName('');
      go(`/console/${p.slug}/overview`);
    }
  };

  return (
    <div className='page active'>
      <div style={{ maxWidth: 620, margin: '60px auto' }}>
        <div className='card'>
          <div className='card-title' style={{ marginBottom: 10 }}>Create Project</div>
          <div className='field'>
            <label>Project Name</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder='Acme Production' />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            Project ID is auto-generated (example: project-m2zpicks).
          </div>
          <div className='modal-footer'>
            <button className='btn btn-primary' onClick={handleCreate} disabled={!projectName.trim()}>Create Project</button>
          </div>
        </div>
      </div>
      <div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div>
    </div>
  );
}