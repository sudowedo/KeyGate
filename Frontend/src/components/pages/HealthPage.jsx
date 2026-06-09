import { useEffect, useState } from 'react';

export default function HealthPage({ ctx, publicMode = false }) {
  const { api, notify } = ctx;
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api('/api/health').then(setRows).catch(() => setRows([]));
  }, []);

  const dayKey = (d) => {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const byDay = new Map(rows.map((r) => [dayKey(r.day), r]));
  const bars = Array.from({ length: 90 }).map((_, idx) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (89 - idx));
    const key = dayKey(d);
    return byDay.get(key) || { day: key, internal_ok: null, db_ok: null, redis_ok: null, details: { missing_record: true } };
  });
  const colorFor = (r) => (r.internal_ok === true ? '#2dca72' : (r.internal_ok === false ? ((r.db_ok || r.redis_ok) ? '#ffb547' : '#ff5252') : '#4b5563'));
  const knownDays = bars.filter((r) => r.internal_ok !== null);
  const upDays = knownDays.filter((r) => r.internal_ok).length;
  const pct = knownDays.length ? ((upDays / knownDays.length) * 100).toFixed(2) : 'N/A';
  const latestKnown = [...bars].reverse().find((r) => r.internal_ok !== null);
  const summary = !latestKnown ? 'No data yet' : (latestKnown.internal_ok ? 'Operational' : ((latestKnown.db_ok || latestKnown.redis_ok) ? 'Degraded' : 'Down'));
  const summaryBg = summary === 'Operational' ? '#2dca7228' : summary === 'Degraded' ? '#ffb54728' : summary === 'Down' ? '#ff525228' : '#4b556328';

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await api('/api/health/refresh-now', { method: 'POST', body: {} });
      const data = await api('/api/health');
      setRows(data);
      notify('Health refreshed');
    } catch (e) {
      notify(e.message || 'Failed to refresh health', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return <div className='page active'><div style={{ padding: '32px 36px' }}>
    <div className='page-header'><div className='page-title'>System Health</div><div className='page-sub'>Public status page for internal server, database, and redis.</div></div>
    <div className='card' style={{background:summaryBg}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><div className='card-title'>Current status: {summary}</div>{!publicMode && <button className='btn btn-ghost btn-sm' disabled={refreshing} onClick={refreshNow}>{refreshing ? 'Refreshing...' : 'Refresh now'}</button>}</div></div>
    <div className='card'>
      <div className='card-title' style={{marginBottom:10}}>Uptime over last 90 days ({pct}%)</div>
      <div style={{display:'flex',gap:12,marginBottom:12,fontSize:12,color:'var(--muted)'}}>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#2dca72',borderRadius:2,marginRight:6}} />Operational</span>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#ffb547',borderRadius:2,marginRight:6}} />Degraded</span>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#ff5252',borderRadius:2,marginRight:6}} />Down</span>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#4b5563',borderRadius:2,marginRight:6}} />No data</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(90,1fr)',gap:3}}>
        {bars.map((r, i) => <div key={i} title={`${r.day}\nInternal: ${r.internal_ok === null ? 'N/A' : (r.internal_ok ? 'OK' : 'FAIL')}\nDB: ${r.db_ok === null ? 'N/A' : (r.db_ok ? 'OK' : 'FAIL')}\nRedis: ${r.redis_ok === null ? 'N/A' : (r.redis_ok ? 'OK' : 'FAIL')}\nDetails: ${JSON.stringify(r.details || {})}`} style={{height:28, borderRadius:3, background:colorFor(r)}} />)}
      </div>
    </div>
  </div></div>;
}
