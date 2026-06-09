import { useEffect, useState } from 'react';
import '../styles/LogsPage.css';

function SkelNotifRow() { return <div style={{display:'flex',justifyContent:'space-between',gap:'10px',flexWrap:'wrap',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><div className='skel skel-inline skel-h skel-w50' /><div className='skel skel-inline skel-h skel-w25' /></div>; }

export default function NotificationsPage({ ctx }) {
  const { subkeys, fmtNum, fmtDate, api, notify, loading } = ctx;
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState({});
  const refresh = async () => setRequests(await api('/api/quota-requests'));
  useEffect(() => { refresh(); }, []);

  const nearLimit = subkeys.filter((s) => (Number(s.tokens_used || 0) / Number(s.monthly_token_limit || 1)) >= 0.8);
  const expiring = subkeys.filter((s) => s.expires_at && (Number(s.expires_at) - Math.floor(Date.now()/1000)) < 7*86400);
  const isLoading = loading?.subkeys;

  const grant = async (id, type, amount, note='') => {
    const k = `grant:${id}:${type}`;
    if (busy[k]) return;
    setBusy((b) => ({ ...b, [k]: true }));
    try {
    const created = await api('/api/quota-requests', { method:'POST', body:{ subkey_id:id, request_type:type, amount, note } });
    await api('/api/quota-requests/' + created.id, { method:'PATCH', body:{ status:'approved' } });
    notify('Grant approved');
    refresh();
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  };
  const decide = async (id, status) => {
    const k = `decide:${id}`;
    if (busy[k]) return;
    setBusy((b) => ({ ...b, [k]: true }));
    try {
      await api('/api/quota-requests/' + id, { method:'PATCH', body:{ status } }); notify('Request updated'); refresh();
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  };

  return <div className='page active'><div style={{padding:'32px 36px'}}><div className='page-header'><div className='page-title'>Notifications</div><div className='page-sub'>Quota alerts, expiry alerts, and admin approvals.</div></div>
    <div className='card'><div className='card-title'>Near limit</div>
      {isLoading ? Array.from({length:2}).map((_,i) => <SkelNotifRow key={i} />)
        : nearLimit.length ? nearLimit.map(s=>{const k=`grant:${s.id}:credits`;return <div key={s.id} style={{display:'flex',justifyContent:'space-between',gap:'10px',flexWrap:'wrap',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><span>{s.name} is near limit ({fmtNum(s.tokens_used)} / {fmtNum(s.monthly_token_limit)})</span><button className='btn btn-amber btn-sm' disabled={busy[k]} onClick={()=>grant(s.id,'credits','20','Admin approved quota extension from notifications')}>{busy[k]?'Granting...':`Grant +20k tokens for ${s.name}`}</button></div>}) : <div className='empty-text'>No near-limit alerts.</div>}
    </div>
    <div className='card'><div className='card-title'>Expiring soon</div>
      {isLoading ? Array.from({length:2}).map((_,i) => <SkelNotifRow key={i} />)
        : expiring.length ? expiring.map(s=>{const k=`grant:${s.id}:expiry_extend`;return <div key={s.id} style={{display:'flex',justifyContent:'space-between',gap:'10px',flexWrap:'wrap',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><span>{s.name} expires on {fmtDate(s.expires_at)}</span><button className='btn btn-amber btn-sm' disabled={busy[k]} onClick={()=>grant(s.id,'expiry_extend','7','Admin approved expiry extension from notifications')}>{busy[k]?'Extending...':`Extend request quota for ${s.name}`}</button></div>}) : <div className='empty-text'>No expiring subkeys.</div>}
    </div>
    <div className='card'><div className='card-title'>Quota extension requests</div>
      {requests.length ? requests.map(r=>{const k=`decide:${r.id}`;return <div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><span>[{r.subkey_name}] asked for {r.request_type} {r.amount ? `(${r.amount})` : ''} — <span className='mono'>{r.status}</span></span><span style={{display:'flex',gap:'6px',flexWrap:'wrap'}}><button className='btn btn-sm btn-green' disabled={busy[k]} onClick={()=>decide(r.id,'approved')}>{busy[k]?'Updating...':'Approve'}</button><button className='btn btn-sm btn-danger' disabled={busy[k]} onClick={()=>decide(r.id,'rejected')}>Reject</button></span></div>}) : <div className='empty-text'>No quota requests yet.</div>}
    </div>
  </div></div>;
}