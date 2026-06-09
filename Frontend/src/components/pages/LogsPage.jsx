import { useMemo, useState } from 'react';
import '../styles/LogsPage.css';
import TableWrap from '../parts/TableWrap';

const fmtCost = (v) => Number(v || 0) ? `$${Number(v).toFixed(6)}` : '—';
const STATUSES = ['all', 'success', 'error', 'quota'];

export default function LogsPage({ ctx }) {
  const { logs, fmtNum, fmtTime } = ctx;
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filteredLogs = useMemo(() => {
    let list = logs;
    // Date filter
    if (startDate) {
      const start = new Date(startDate).getTime() / 1000;
      list = list.filter((l) => (l.created_at || 0) >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime() / 1000 + 86400; // end of day
      list = list.filter((l) => (l.created_at || 0) <= end);
    }
    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((l) => l.status === statusFilter);
    }
    // Sort
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let av, bv;
        if (sortKey === 'time') { av = a.created_at || 0; bv = b.created_at || 0; }
        else if (sortKey === 'tokens') { av = a.tokens_used || 0; bv = b.tokens_used || 0; }
        else if (sortKey === 'cost') { av = Number(a.estimated_cost_usd || 0); bv = Number(b.estimated_cost_usd || 0); }
        else if (sortKey === 'latency') { av = a.latency_ms || 0; bv = b.latency_ms || 0; }
        else if (sortKey === 'status') { av = a.status || ''; bv = b.status || ''; }
        else { av = a.created_at || 0; bv = b.created_at || 0; }
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [logs, sortKey, sortDir, statusFilter, startDate, endDate]);

  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = useMemo(() => filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize), [filteredLogs, safePage]);
  const sourceCounts = logs.reduce((a, l) => { const k = l.source || 'external'; a[k] = (a[k] || 0) + 1; return a; }, {});

  return <div className='page active'><div style={{ padding: '32px 36px' }}><div className='page-header'><div className='page-title'>Request logs</div><div className='page-sub'>Every request proxied through KeyGate</div></div>
    <div className='card'><div className='card-header'><div className='card-title'>Source breakdown</div></div><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{Object.entries(sourceCounts).map(([k, v]) => <span key={k} className='badge active'>{k}: {v}</span>)}</div></div>
    <div className='date-filter-bar'>
      <label>From</label>
      <input type='date' className='date-input' value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
      <label>To</label>
      <input type='date' className='date-input' value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
      {(startDate || endDate) && <button className='btn btn-sm btn-ghost' onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}>Clear</button>}
    </div>
    <div className='filter-chips'>{STATUSES.map((s) => <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => { setStatusFilter(s); setPage(1); }}>{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</button>)}</div>
    <div className='card mobile-hide-table' style={{ padding: 0 }}><TableWrap><table><thead><tr><th className={`sortable ${sortKey === 'time' ? sortDir : ''}`} onClick={() => toggleSort('time')}>Time</th><th>Req ID</th><th>Subkey</th><th>Provider</th><th>Model</th><th className={`sortable ${sortKey === 'tokens' ? sortDir : ''}`} onClick={() => toggleSort('tokens')}>Tokens</th><th className={`sortable ${sortKey === 'cost' ? sortDir : ''}`} onClick={() => toggleSort('cost')}>Cost</th><th className={`sortable ${sortKey === 'latency' ? sortDir : ''}`} onClick={() => toggleSort('latency')}>Latency</th><th className={`sortable ${sortKey === 'status' ? sortDir : ''}`} onClick={() => toggleSort('status')}>Status</th><th>Error</th></tr></thead><tbody>{pagedLogs.length ? pagedLogs.map((l, i) => <tr key={i}><td className='mono' style={{ color: 'var(--dim)' }}>{fmtTime(l.created_at)}</td><td className='mono' style={{ fontSize: '11px' }}>{l.request_id ? String(l.request_id).slice(0, 8) : '—'}</td><td style={{ fontWeight: 500 }}>{l.subkey_name || '—'}</td><td className='mono'>{l.provider || '—'}</td><td className='mono' style={{ fontSize: '12px' }}>{l.model || '—'}</td><td className='mono'>{fmtNum(l.tokens_used)} <span style={{color:'var(--dim)'}}>({fmtNum(l.prompt_tokens || 0)}/{fmtNum(l.completion_tokens || 0)})</span></td><td className='mono'>{fmtCost(l.estimated_cost_usd)}</td><td className='mono' style={{ color: 'var(--muted)' }}>{l.latency_ms ? `${l.latency_ms}ms` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 500 }}>{l.status}</td><td className='mono' style={{ color: l.error_reason ? 'var(--amber)' : 'var(--dim)' }}>{l.error_reason || '—'}</td></tr>) : <tr><td colSpan='10' style={{ textAlign: 'center', color: 'var(--dim)', padding: '32px' }}>No requests match the current filters</td></tr>}</tbody></table></TableWrap></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:10,flexWrap:'wrap'}}>
      <div className='mono' style={{color:'var(--muted)'}}>Page {safePage} / {totalPages} · {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''} found</div>
      <div style={{display:'flex',gap:8}}>
        <button className='btn btn-sm btn-ghost' disabled={safePage<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>Previous</button>
        <button className='btn btn-sm btn-ghost' disabled={safePage>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))}>Next</button>
      </div>
    </div>
    <div className='mobile-log-cards'>{pagedLogs.map((l, i) => <div key={i} className='card'><div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><strong>{l.subkey_name || '—'}</strong><span className='mono'>{fmtTime(l.created_at)}</span></div><div className='mono' style={{ marginTop: '6px', color: 'var(--muted)' }}>{l.provider || '—'} · {l.model || '—'}</div><div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span>{fmtNum(l.tokens_used)} tokens</span><span>{fmtCost(l.estimated_cost_usd)}</span></div><div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span className='badge active'>{l.source || 'external'}</span><span className='mono'>{l.status}</span></div>{l.error_reason && <div className='mono' style={{ marginTop: 8, color: 'var(--amber)' }}>{l.error_reason}</div>}</div>)}</div>
  </div></div>;
}