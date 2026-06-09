import { useEffect, useMemo, useState } from 'react';
import '../styles/SubkeysPage.css';
import { IconCopy, IconCheck } from '../parts/Icons';
import TableWrap from '../parts/TableWrap';
import { FALLBACK_PROVIDERS, providerLabel, providerModels as getProviderModels } from '../../lib/providers';

export default function SubkeysPage({ ctx }) {
  const { subkeys, api, loadSubkeys, loadMasterKeys, masterKeys, notify, fmtNum, fmtDate, quotaColor, modal, setModal, setRevealedToken, revealedToken, providers = FALLBACK_PROVIDERS } = ctx;
  const providerOptions = providers.length ? providers : FALLBACK_PROVIDERS;
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [limit, setLimit] = useState(50000);
  const [maxRequests, setMaxRequests] = useState(5000);
  const [spend, setSpend] = useState('');
  const [expiry, setExpiry] = useState('');
  const [models, setModels] = useState([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModels, setSelectedModels] = useState(['all']);
  const [masterKeyId, setMasterKeyId] = useState('');
  const [autoRoute, setAutoRoute] = useState(false);
  const [editingSubkey, setEditingSubkey] = useState(null);
  const [editLimit, setEditLimit] = useState('');
  const [editMaxRequests, setEditMaxRequests] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savedChip, setSavedChip] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [revealCopied, setRevealCopied] = useState(false);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filteredSubkeys = useMemo(() => {
    let list = statusFilter === 'all' ? subkeys : subkeys.filter((s) => s.status === statusFilter);
    if (!sortKey) return list;
    return [...list].sort((a, b) => {
      let av, bv;
      if (sortKey === 'name') { av = a.name?.toLowerCase() || ''; bv = b.name?.toLowerCase() || ''; }
      else if (sortKey === 'provider') { av = a.provider || ''; bv = b.provider || ''; }
      else if (sortKey === 'quota') { av = a.tokens_used / Math.max(a.monthly_token_limit, 1); bv = b.tokens_used / Math.max(b.monthly_token_limit, 1); }
      else if (sortKey === 'requests') { av = a.request_count || 0; bv = b.request_count || 0; }
      else if (sortKey === 'expires') { av = a.expires_at || 0; bv = b.expires_at || 0; }
      else if (sortKey === 'status') { av = a.status || ''; bv = b.status || ''; }
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [subkeys, sortKey, sortDir, statusFilter]);

  useEffect(() => {
    api('/api/providers').then((r) => setModels((r.providers || []).flatMap((p) => (p.models || []).map((m) => ({ ...m, provider: p.id }))))).catch(() => setModels([]));
    loadMasterKeys();
  }, []);

  const providerModels = getProviderModels(providerOptions, provider);
  const filteredModels = providerModels.filter((m)=>m.toLowerCase().includes(modelSearch.toLowerCase()));

  const createSubkey = async () => {
    if (!name.trim()) return notify('Enter a name', 'error');
    const providerKeys = masterKeys.filter((mk) => mk.provider === provider);
    if (!providerKeys.length) return notify('Add a Master Key first', 'error');
    const allowed_models = selectedModels.includes('all') ? ['all'] : selectedModels.filter((m) => providerModels.includes(m));
    const sk = await api('/api/subkeys', {
      method: 'POST',
      body: {
        name: name.trim(), provider, master_key_id: masterKeyId || null, auto_route_on_exhausted: autoRoute,
        monthly_token_limit: Number(limit) || 50000,
        max_requests: Number(maxRequests) || 5000,
        allowed_models,
        spend_limit_usd: spend ? Number(spend) : null,
        expires_in_days: expiry ? Number(expiry) : null,
      }
    });
    if (sk.error) return notify(sk.error, 'error');
    setName(''); setProvider('openai'); setLimit(50000); setMaxRequests(5000); setSpend(''); setExpiry(''); setSelectedModels(['all']); setMasterKeyId(''); setAutoRoute(false);
    setRevealedToken(sk.token); setModal('tokenreveal'); loadSubkeys();
  };

  const openEdit = (sk) => {
    setEditingSubkey(sk);
    setEditLimit(sk.monthly_token_limit || 50000);
    setEditMaxRequests(sk.max_requests || 5000);
    setEditExpiry('');
    setModal('editsubkey');
  };

  const saveEdit = async () => {
    if (!editingSubkey) return;
    const prev = [...subkeys];
    setSavingEdit(true);
    try {
      ctx.setSubkeys((list) => list.map((x) => x.id === editingSubkey.id ? { ...x, monthly_token_limit: Number(editLimit), max_requests: Number(editMaxRequests) } : x));
      const res = await api(`/api/subkeys/${editingSubkey.id}`, {
        method: 'PATCH',
        body: {
          monthly_token_limit: Number(editLimit),
          max_requests: Number(editMaxRequests),
          expires_in_days: editExpiry === '' ? undefined : (editExpiry === 'never' ? null : Number(editExpiry)),
        }
      });
      if (res?.subkey) ctx.setSubkeys((list) => list.map((x) => x.id === res.subkey.id ? { ...x, ...res.subkey } : x));
      setSavedChip(true);
      setTimeout(() => setSavedChip(false), 1400);
      notify('Subkey limits updated');
      await loadSubkeys();
    } catch (e) {
      ctx.setSubkeys(prev);
      notify(e.message || 'Failed to update subkey', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateStatus = async (nextStatus) => {
    if (!editingSubkey || statusLoading) return;
    if (nextStatus === 'revoked' && !window.confirm(`Revoke "${editingSubkey.name}"? Existing clients using this subkey will stop working immediately.`)) return;
    const prev = [...subkeys];
    setStatusLoading(true);
    try {
      ctx.setSubkeys((list) => list.map((x) => x.id === editingSubkey.id ? { ...x, status: nextStatus } : x));
      await api('/api/subkeys/' + editingSubkey.id, { method: 'PATCH', body: { status: nextStatus } });
      await loadSubkeys();
    } catch (e) {
      ctx.setSubkeys(prev);
      notify(e.message || 'Failed to update status', 'error');
    } finally {
      setStatusLoading(false);
    }
  };
  const deleteSubkey = async () => {
    if (!editingSubkey) return;
    if (!window.confirm(`Delete subkey "${editingSubkey.name}"?\n\nThis action is irreversible and issued token will stop working immediately.`)) return;
    await api(`/api/subkeys/${editingSubkey.id}`, { method: 'DELETE' });
    notify('Subkey deleted');
    setModal('');
    setEditingSubkey(null);
    await loadSubkeys();
  };

  const STATUSES = ['all', 'active', 'paused', 'revoked'];

  return <div className='page active'><div style={{ padding: '32px 36px' }}><div className='page-header mobile-header-stack' style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}><div><div className='page-title'>Subkeys</div><div className='page-sub'>Scoped API tokens you distribute to employees, clients, or teams</div></div><button className='btn btn-primary' onClick={() => setModal('createsubkey')}>+ Create subkey</button></div>
    <div className='filter-chips'>{STATUSES.map((s) => <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</button>)}</div>
    <div className='card' style={{ padding: 0 }}><TableWrap><table><thead><tr><th className={`sortable ${sortKey === 'name' ? sortDir : ''}`} onClick={() => toggleSort('name')}>Name</th><th>Token</th><th className={`sortable ${sortKey === 'provider' ? sortDir : ''}`} onClick={() => toggleSort('provider')}>Provider</th><th className={`sortable ${sortKey === 'quota' ? sortDir : ''}`} onClick={() => toggleSort('quota')}>Quota</th><th className={`sortable ${sortKey === 'requests' ? sortDir : ''}`} onClick={() => toggleSort('requests')}>Max req</th><th className={`sortable ${sortKey === 'expires' ? sortDir : ''}`} onClick={() => toggleSort('expires')}>Expires</th><th className={`sortable ${sortKey === 'status' ? sortDir : ''}`} onClick={() => toggleSort('status')}>Status</th><th>Actions</th></tr></thead><tbody>{!filteredSubkeys.length ? <tr><td colSpan='8' style={{ textAlign: 'center', color: 'var(--dim)', padding: '32px' }}>{statusFilter !== 'all' ? 'No subkeys match this filter.' : 'No subkeys yet — create one above. '}<button className='btn btn-sm btn-ghost' onClick={()=>window.history.pushState({},'',window.location.pathname.replace('/subkeys','/masterkeys')) || window.dispatchEvent(new PopStateEvent('popstate'))}>Add Master Key</button></td></tr> : filteredSubkeys.map((sk) => {const pct = Math.min(100, Math.round((sk.tokens_used / sk.monthly_token_limit) * 100)); const col = quotaColor(sk.tokens_used, sk.monthly_token_limit); const masked = sk.token_preview || `${sk.token_prefix || 'sk-kg-'}••••`; return <tr key={sk.id}><td style={{ fontWeight: 500 }}>{sk.name}</td><td><div className='token-box' style={{ maxWidth: '200px' }}><span className='token-val'>{masked}</span></div></td><td><span style={{ fontSize: '12px', background: 'var(--bg3)', padding: '3px 8px', borderRadius: '4px', fontFamily: 'DM Mono, monospace' }}>{sk.provider}</span></td><td style={{ minWidth: '120px' }}><div className='quota-bar'><div className={`quota-fill ${col}`} style={{ width: `${pct}%` }} /></div><div className='quota-text'>{fmtNum(sk.tokens_used)} / {fmtNum(sk.monthly_token_limit)}</div></td><td className='mono'>{fmtNum(sk.request_count || 0)} / {fmtNum(sk.max_requests || 5000)}</td><td style={{ fontSize: '12px', color: 'var(--muted)' }}>{fmtDate(sk.expires_at)}</td><td><span className={`badge ${sk.status}`}>{sk.status}</span></td><td><button className='btn btn-sm btn-ghost action-primary' onClick={()=>openEdit(sk)}>Manage</button></td></tr>;})}</tbody></table></TableWrap></div>

    <div className={`modal-backdrop ${modal === 'createsubkey' ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal('')}><div className='modal'><div className='modal-title'>Create subkey</div><div className='form-row'><div className='field'><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. Client A — Frontend' /></div><div className='field'><label>Provider</label><select value={provider} onChange={(e) => { setProvider(e.target.value); setSelectedModels(['all']); setMasterKeyId(''); }}>{providerOptions.map((p)=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div></div><div className='form-row'><div className='field'><label>Monthly token limit</label><input type='number' value={limit} onChange={(e) => setLimit(e.target.value)} min='100' /></div><div className='field'><label>Max allowed requests</label><input type='number' value={maxRequests} onChange={(e)=>setMaxRequests(e.target.value)} min='1' /></div></div><div className='form-row'><div className='field'><label>Spend ceiling (USD)</label><input type='number' value={spend} onChange={(e) => setSpend(e.target.value)} placeholder='Optional' min='0' step='0.01' /></div></div><div className='form-row'><div className='field'><label>Select master key for this subkey</label><select value={masterKeyId} onChange={(e)=>setMasterKeyId(e.target.value)}><option value=''>Auto latest by provider</option>{masterKeys.filter((mk)=>mk.provider===provider).map((mk)=><option key={mk.id} value={mk.id}>{mk.name || providerLabel(providerOptions, mk.provider)} ({mk.key_masked})</option>)}</select></div><div className='field'><label style={{display:'flex',gap:'8px',alignItems:'center'}}><input type='checkbox' checked={autoRoute} onChange={(e)=>setAutoRoute(e.target.checked)} /> Auto-route if selected key is out of credits</label></div></div><div className='form-row single'><div className='field'><label>Expires in (days)</label><input type='number' value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder='Leave blank = never' /></div></div>
      <div className='form-row single'><div className='field'><label>Search model</label><input value={modelSearch} onChange={(e)=>setModelSearch(e.target.value)} placeholder='Search models...' /></div></div><div className='form-row single'><div className='field'><label>Allowed models</label><div style={{maxHeight:'180px',overflow:'auto',border:'1px solid var(--border)',padding:'8px',borderRadius:'6px'}}><label style={{display:'block',marginBottom:'6px'}}><input type='checkbox' checked={selectedModels.includes('all')} onChange={(e)=>setSelectedModels(e.target.checked?['all']:[])} /> all</label>{filteredModels.map((m)=><label key={m} style={{display:'block',marginBottom:'4px'}}><input type='checkbox' checked={selectedModels.includes('all')?false:selectedModels.includes(m)} disabled={selectedModels.includes('all')} onChange={(e)=>setSelectedModels((prev)=>e.target.checked?[...prev.filter(x=>x!=='all'),m]:prev.filter(x=>x!==m))} /> {m}</label>)}</div></div></div>
      <div className='modal-footer'><button className='btn btn-ghost' onClick={() => setModal('')}>Cancel</button><button className='btn btn-primary' onClick={createSubkey}>Generate subkey</button></div></div></div>

    <div className={`modal-backdrop ${modal === 'editsubkey' ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal('')}><div className='modal subkey-drawer'><div className='modal-title'>Manage Subkey {savedChip && <span className='badge active' style={{marginLeft:8}}>Saved</span>}</div><div className='action-grid' style={{marginBottom:'12px'}}><button className='btn btn-sm btn-ghost' disabled={statusLoading} onClick={()=>updateStatus('paused')}>Pause</button><button className='btn btn-sm btn-green' disabled={statusLoading} onClick={()=>updateStatus('active')}>Activate</button><button className='btn btn-sm btn-danger' disabled={statusLoading} onClick={()=>updateStatus('revoked')}>{statusLoading ? 'Updating...' : 'Revoke'}</button></div><div className='form-row'><div className='field'><label>Monthly token limit</label><input type='number' min='1' value={editLimit} onChange={(e)=>setEditLimit(e.target.value)} /></div><div className='field'><label>Max requests</label><input type='number' min='1' value={editMaxRequests} onChange={(e)=>setEditMaxRequests(e.target.value)} /></div></div><div className='form-row single'><div className='field'><label>Expiry extension (days)</label><input type='number' min='1' value={editExpiry} onChange={(e)=>setEditExpiry(e.target.value)} placeholder='Leave blank to keep existing expiry' /></div></div><div className='modal-footer'><button className='btn btn-danger' onClick={deleteSubkey}>Delete subkey</button><button className='btn btn-ghost' onClick={() => setModal('')}>Close</button><button className='btn btn-primary' disabled={savingEdit} onClick={saveEdit}>{savingEdit ? 'Saving...' : 'Save'}</button></div></div></div>

    <div className={`modal-backdrop ${modal === 'tokenreveal' ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal('')}><div className='modal'><div className='modal-title'>Subkey created</div><div style={{ fontSize: '13px', color: 'var(--muted)' }}>Copy this token now. It won't be shown again in full.</div><div className='reveal-box'><div className='reveal-label'>Your subkey token</div><div className='reveal-token'>{revealedToken}</div></div><div className='reveal-warning'><span>⚠</span><span>This is shown once. Save it somewhere safe — your client will use this as their API key.</span></div><div className='modal-footer'><button className='btn btn-ghost copy-btn' onClick={() => { navigator.clipboard.writeText(revealedToken); setRevealCopied(true); setTimeout(() => setRevealCopied(false), 1600); }}>{revealCopied ? <><IconCheck width={16} height={16} /> Copied</> : <><IconCopy width={16} height={16} /> Copy token</>}{revealCopied && <span className='copy-flash'>Copied!</span>}</button><button className='btn btn-primary' onClick={() => setModal('')}>Done</button></div></div></div>
  </div></div>;
}
