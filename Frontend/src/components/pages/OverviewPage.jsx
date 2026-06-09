import '../styles/OverviewPage.css';

function SkelStat() { return <div className='stat'><div className='skel skel-inline skel-h3 skel-w50' style={{marginBottom:8}} /><div className='skel skel-inline skel-h skel-w25' style={{marginBottom:4}} /><div className='skel skel-inline skel-h skel-w40' style={{marginTop:4}} /></div>; }
function SkelMiniCard() { return <div className='card' style={{ margin: 0, padding: '14px' }}><div className='skel skel-block skel-h skel-w40' /><div className='skel skel-block skel-h skel-w60' style={{marginTop:6}} /></div>; }
function SkelGraph() { return <div style={{ display: 'flex', alignItems: 'end', gap: '4px', height: '70px' }}>{Array.from({length:20}).map((_,i) => <div key={i} className='skel' style={{width:'8px', height:`${Math.max(8, 64, Math.random()*50+10)}px`, borderRadius:'2px'}} />)}</div>; }
function SkelRow() { return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}><span className='skel skel-inline skel-h skel-w50' /><span className='skel skel-inline skel-h skel-w20' /></div>; }

export default function OverviewPage({ ctx, navigate }) {
  const { subkeys, logs, analytics, fmtNum, quotaColor, fmtTime, loading } = ctx;
  const failed = logs.filter((l) => l.status !== 'success').length;
  const costUsed = analytics.costAttribution?.reduce((s, r) => s + (r.est_cost_usd || 0), 0) || 0;
  const todayBySubkey = logs.reduce((acc, l) => {
    acc[l.subkey_name || '—'] = (acc[l.subkey_name || '—'] || 0) + (l.tokens_used || 0);
    return acc;
  }, {});
  const topUser = Object.entries(todayBySubkey).sort((a, b) => b[1] - a[1])[0];
  const recentActivity = logs.slice(0, 4);
  const prevReq = logs.slice(15, 30).length || 1;
  const reqTrend = Math.round(((logs.slice(0, 15).length - prevReq) / prevReq) * 100);
  const prevFail = logs.slice(15, 30).filter((l) => l.status !== 'success').length || 1;
  const failTrend = Math.round(((logs.slice(0, 15).filter((l) => l.status !== 'success').length - prevFail) / prevFail) * 100);
  const isLoading = loading?.overview;

  return <div className='page active'><div style={{ padding: '32px 36px' }}>
    <div className='page-header'><div className='page-title'>Overview</div><div className='page-sub'>Observability dashboard for proxy usage</div></div>

    <div className='stats mobile-quick-stats'>
      {isLoading ? <>
        <SkelStat /><SkelStat /><SkelStat /><SkelStat />
      </> : <>
        <div className='stat'><div className='stat-val'>{fmtNum(analytics.totalRequests)}</div><div className='stat-label'>Requests</div><div className='stat-trend'>{reqTrend >= 0 ? `↑${Math.abs(reqTrend)}%` : `↓${Math.abs(reqTrend)}%`}</div></div>
        <div className='stat'><div className='stat-val'>{fmtNum(failed)}</div><div className='stat-label'>Failed</div><div className='stat-trend'>{failTrend >= 0 ? `↑${Math.abs(failTrend)}%` : `↓${Math.abs(failTrend)}%`}</div></div>
        <div className='stat'><div className='stat-val'>${costUsed.toFixed(2)}</div><div className='stat-label'>Cost</div></div>
        <div className='stat'><div className='stat-val'>{analytics.avgLatency || '—'}</div><div className='stat-label'>Latency</div></div>
      </>}
    </div>

    <div className='card health-card'><div className='card-header'><div><div className='card-title'>Health & abuse detection</div><div className='card-sub'>Fast signal check before deep analytics</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('logs')}>Inspect logs →</button></div>
      {isLoading ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><SkelMiniCard /><SkelMiniCard /></div>
        : <div className='mobile-stack-grid' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className='card' style={{ margin: 0, padding: '14px' }}><div className='card-sub'>Top user</div><div className='mono' style={{ fontSize: '13px', marginTop: '4px' }}>{topUser ? `${topUser[0]} — ${fmtNum(topUser[1])} tokens` : '—'}</div></div>
          <div className='card' style={{ margin: 0, padding: '14px' }}><div className='card-sub'>Abuse detection</div><div style={{ marginTop: '4px', fontSize: '12px' }}>{failed > analytics.totalRequests * 0.35 ? '⚠ High error ratio detected' : '✅ No suspicious activity'}</div></div>
        </div>}
    </div>

    <div className='card graph-card'><div className='card-header'><div><div className='card-title'>Usage graph</div><div className='card-sub'>Proxy requests trend</div></div><div className='timeframe'><button className='btn btn-ghost btn-sm'>24H</button><button className='btn btn-ghost btn-sm'>7D</button><button className='btn btn-ghost btn-sm'>30D</button></div></div>
      {isLoading ? <SkelGraph /> : <div className='graph-frame' style={{ display: 'flex', alignItems: 'end', gap: '4px', height: '70px' }}>{logs.slice(0, 30).reverse().map((l, i) => <div key={i} title={`${l.subkey_name || '—'} | ${l.model || '—'} | ${fmtNum(l.tokens_used)} tokens | ${l.status}`} style={{ width: '8px', height: `${Math.max(8, Math.min(64, (l.tokens_used || 1) / 20))}px`, background: 'var(--accent)', opacity: .8, borderRadius: '2px' }} />)}</div>}
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Recent activity</div><div className='card-sub'>Latest proxy events</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('logs')}>Open logs →</button></div>
      {isLoading ? Array.from({length:4}).map((_,i) => <SkelRow key={i} />)
        : !recentActivity.length ? <div className='empty'><div className='empty-text'>No activity yet</div></div> : recentActivity.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}><span>{l.subkey_name || 'Unknown subkey'} — {l.status}</span><span className='mono'>{fmtTime(l.created_at)}</span></div>)}
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Subkey analytics</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>Manage keys →</button></div>
      {isLoading ? Array.from({length:5}).map((_,i) => <SkelRow key={i} />)
        : Object.entries(todayBySubkey).length ? Object.entries(todayBySubkey).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, tokens]) => <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span>{name}</span><span className='mono'>{fmtNum(tokens)} tokens today</span></div>) : <div className='empty'><div className='empty-text'>No subkey usage yet</div></div>}
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Subkey usage snapshot</div><div className='card-sub'>Quota consumption across all active keys</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>Manage →</button></div>
      {isLoading ? Array.from({length:3}).map((_,i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}><div style={{flex:1}}><div className='skel skel-block skel-h skel-w40' style={{marginBottom:6}} /><div className='skel skel-block skel-bar' /><div className='skel skel-block skel-h skel-w60' style={{marginTop:6}} /></div></div>)
        : !subkeys.length ? <div className='empty'><div className='empty-text'>No subkeys yet — <button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>create one</button></div></div> : subkeys.slice(0, 5).map((sk) => {
          const pct = Math.min(100, Math.round((sk.tokens_used / sk.monthly_token_limit) * 100));
          const col = quotaColor(sk.tokens_used, sk.monthly_token_limit);
          return <div key={sk.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>{sk.name}</div><div className='quota-bar'><div className={`quota-fill ${col}`} style={{ width: `${pct}%` }} /></div><div className='quota-text'>{fmtNum(sk.tokens_used)} / {fmtNum(sk.monthly_token_limit)} tokens — {pct}%</div></div><span className={`badge ${sk.status}`}>{sk.status}</span></div>;
        })}
    </div>
  </div></div>;
}