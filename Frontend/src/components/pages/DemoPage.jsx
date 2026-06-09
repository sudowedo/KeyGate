import { useEffect, useMemo, useState } from 'react';
import '../styles/DemoPage.css';
import { IconCopy, IconCheck } from '../parts/Icons';
import { FALLBACK_PROVIDERS, parseAllowedModels, providerDefaultModel, providerLabel, providerModels } from '../../lib/providers';
import { cacheBust } from '../../lib/cache';

export default function DemoPage({ ctx }) {
  const { subkeys, API, api, notify, sleep, copyText, providers = FALLBACK_PROVIDERS } = ctx;
  const providerOptions = providers.length ? providers : FALLBACK_PROVIDERS;
  const [selectedSubkeyId, setSelectedSubkeyId] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [prompt, setPrompt] = useState('Say hello in exactly 5 words.');
  const [consoleLines, setConsoleLines] = useState(['# KeyGate live proxy demo', '# Select a subkey and hit "Run test call" to see the magic', 'ready — waiting for request']);

  const active = subkeys.filter((s) => s.status === 'active');
  const selectedSubkey = active.find((s) => s.id === selectedSubkeyId);
  const tokenPreview = selectedSubkey?.token_preview || '';

  const allowedModelList = useMemo(() => {
    if (!selectedSubkey) return providerModels(providerOptions, 'openai');

    const providerDefaults = providerModels(providerOptions, selectedSubkey.provider);
    const allowed = parseAllowedModels(selectedSubkey.allowed_models);
    if (!allowed.length || allowed.includes('all')) return providerDefaults;
    const filtered = allowed.filter((m) => providerDefaults.includes(m));
    return filtered.length ? filtered : providerDefaults;
  }, [selectedSubkey, providerOptions]);

  useEffect(() => {
    if (!allowedModelList.includes(model)) setModel(allowedModelList[0] || providerDefaultModel(providerOptions, selectedSubkey?.provider || 'openai'));
  }, [allowedModelList, model, selectedSubkey, providerOptions]);

  const preview = !selectedSubkey ? 'Select a subkey to see the request preview...' : `POST /v1/chat/completions\nAuthorization: Bearer ${tokenPreview || 'sk-kg-••••'}\n\n{\n  "model": "${model}",\n  "messages": [{\n    "role": "user",\n    "content": "${prompt}"\n  }]\n}`;
  const [copiedSnippet, setCopiedSnippet] = useState('');
  const add = (line) => setConsoleLines((v) => [...v, line]);

  const curlSnippet = `TOKEN="sk-kg-YourTokenHere"\ncurl https://keygate-backend.onrender.com/v1/chat/completions \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"${prompt}"}]}'`;
  const jsSnippet = `fetch('https://keygate-backend.onrender.com/v1/chat/completions', {\n  method: 'POST',\n  headers: { Authorization: 'Bearer sk-kg-YourTokenHere', 'Content-Type': 'application/json' },\n  body: JSON.stringify({ model: '${model}', messages: [{ role: 'user', content: '${prompt}' }] })\n}).then(r => r.json()).then(console.log);`;
  const pySnippet = `import requests\nres = requests.post('https://keygate-backend.onrender.com/v1/chat/completions',\n  headers={'Authorization':'Bearer sk-kg-YourTokenHere','Content-Type':'application/json'},\n  json={'model':'${model}','messages':[{'role':'user','content':'${prompt}'}]})\nprint(res.json())`;

  const runDemo = async () => {
    if (!selectedSubkey) return notify('Select a subkey first', 'error');
    if (!prompt.trim()) return notify('Enter a prompt', 'error');
    if (!model) return notify('Select a model', 'error');
    const tokenHint = selectedSubkey.token_preview || selectedSubkey.token_prefix || 'sk-kg-';
    setConsoleLines([`$ sending request with subkey ${tokenHint}…`]);
    await sleep(250); add('→ validating subkey + model allowlist');
    await sleep(250); add(`→ provider/model: ${providerLabel(providerOptions, selectedSubkey.provider)} / ${model}`);
    try {
      const demoToken = (await api(`/api/subkeys/${selectedSubkey.id}/demo-token`)).token;
      const res = await fetch(API + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-keygate-client': 'dashboard', Authorization: 'Bearer ' + demoToken }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 150 }) });
      const data = await res.json();
      if (!res.ok) { add(`✗ error ${res.status}: ${data.error?.message || 'unknown error'}`); return; }
      add(`✓ response received`); add(`→ tokens used: ${data.usage?.total_tokens || 0}`); add('AI response:'); add(data.choices?.[0]?.message?.content || ''); notify('Request proxied — check logs for usage');
      cacheBust('/api/analytics'); cacheBust('/api/subkeys'); cacheBust('/api/master-keys');
    } catch (e) { add(`✗ connection error: ${e.message}`); }
  };

  const snippetCard = (title, code) => <div className='card copy-btn' onClick={() => { navigator.clipboard.writeText(code); setCopiedSnippet(title); setTimeout(() => setCopiedSnippet(''), 1600); }} style={{ cursor: 'pointer' }}><div className='card-title' style={{display:'flex',alignItems:'center',gap:8}}>{title}{copiedSnippet === title ? <><IconCheck width={14} height={14} style={{color:'var(--green)'}} /> <span style={{fontSize:11,color:'var(--green)',fontWeight:500}}>Copied!</span></> : <IconCopy width={14} height={14} style={{color:'var(--muted)'}} />}</div><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'DM Mono, monospace', fontSize: '12px', marginTop: '8px' }}>{code}</pre>{copiedSnippet === title && <span className='copy-flash'>Copied!</span>}</div>;

  return <div className='page active demo-page'><div style={{ padding: '32px 36px' }}><div className='page-header'><div className='page-title'>Live demo</div><div className='page-sub'>See exactly how a client uses a subkey — without ever knowing the real key</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
      <div className='card'><div className='card-header'><div className='card-title'>Configure test call</div></div>
        {!active.length && <div className='empty-text'>No active subkeys. <button className='btn btn-sm btn-ghost' onClick={()=>{ window.history.pushState({},'',window.location.pathname.replace('/demo','/subkeys')); window.dispatchEvent(new PopStateEvent('popstate')); }}>Create Subkey</button></div>}
        <div className='field' style={{marginBottom:10}}><label>Subkey to test</label><select value={selectedSubkeyId} onChange={(e) => setSelectedSubkeyId(e.target.value)}><option value=''>— select a subkey —</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className='field' style={{marginBottom:10}}><label>Provider</label><div className='badge active'>{selectedSubkey ? providerLabel(providerOptions, selectedSubkey.provider) : 'Select a subkey'}</div></div><div className='field' style={{marginBottom:10}}><label>Model</label><select value={model} onChange={(e) => setModel(e.target.value)}>{allowedModelList.map((m) => <option key={m} value={m}>{m}</option>)}</select><div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Only models allowed by the selected subkey are shown.</div></div>
        <div className='field' style={{marginBottom:14}}><label>Prompt</label><input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
        <button className='btn btn-primary' style={{ width: '100%', marginTop: 6, minHeight: 42 }} onClick={runDemo}>Run test call →</button>
      </div>
      <div className='card' style={{ background: '#060609' }}><div className='card-title' style={{ color: 'var(--text)' }}>What the client sends</div><pre style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px', color: 'var(--text)', lineHeight: 1.9, whiteSpace: 'pre-wrap', marginTop: '8px' }}>{preview}</pre></div>
    </div>
    <div className='console'><div className='console-bar'><div className='dot r' /><div className='dot y' /><div className='dot g' /><span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>KeyGate proxy console</span></div><div className='console-body'>{consoleLines.map((l, i) => <p key={i} className='console-line'>{l}</p>)}</div></div>
    <div className='snippet-grid' style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>{snippetCard('Auto-generated JS snippet (click to copy)', jsSnippet)}{snippetCard('Auto-generated Python snippet (click to copy)', pySnippet)}{snippetCard('Auto-generated cURL snippet (click to copy)', curlSnippet)}</div>
  </div></div>;
}
