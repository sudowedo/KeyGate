'use strict';

require('dotenv').config();
const { randomUUID, createHash } = require('crypto');
const fastify = require('fastify')({ logger: { level: 'info' }, genReqId: () => randomUUID() });
const { createClient } = require('redis');
const { query, initDb, encryptSecret, decryptSecret } = require('./db');
const { requireAuth, requireOrgRole, loadUserOrganizations } = require('./auth');
const { listProviders, listModels, getProvider, getProviderForModel, getDefaultModel, isModelAllowedForProvider, normalizeAllowedModels, normalizeProviderModel, normalizeUsage, estimateCostUsd, callProvider, normalizeProviderResponse, toOpenAIChatCompletionResponse } = require('./providers');

const DEFAULT_RPM_LIMIT = Number(process.env.RATE_LIMIT_DEFAULT_PER_MIN || 2);
const redis = createClient({ url: process.env.REDIS_URL });
const ERR = (code, message) => ({ error: { code, message } });
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-keygate-client', 'x-project-id'],
});
fastify.register(require('@fastify/helmet'), { contentSecurityPolicy: false });

function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function maskKey(apiKey) { return apiKey.slice(0, 7) + '••••••••' + apiKey.slice(-4); }

async function insertRequestLog({ req, subkey = {}, model = null, tokensUsed = 0, promptTokens = 0, completionTokens = 0, status, errorReason = null, source, latencyMs, estimatedCostUsd = 0 }) {
  const id = randomUUID();
  const provider = subkey.provider || null;
  await query(
    `INSERT INTO request_logs (id,request_id,project_id,subkey_id,subkey_name,provider,model,tokens_used,prompt_tokens,completion_tokens,estimated_cost_usd,status,error_reason,source,latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, req.id, subkey.project_id, subkey.id || null, subkey.name || null, provider, model, tokensUsed, promptTokens, completionTokens, estimatedCostUsd, status, errorReason, source || req.headers['x-keygate-client'] || 'external', latencyMs],
  );
  req.log.info({
    event: 'gateway_request_log',
    log_id: id,
    provider,
    model,
    status,
    error_reason: errorReason,
    tokens_used: tokensUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: estimatedCostUsd,
    latency_ms: latencyMs,
    subkey_id: subkey.id || null,
    project_id: subkey.project_id || null,
  }, 'gateway request logged');
}

async function rateLimitBySubkey(subkeyId, limit = DEFAULT_RPM_LIMIT) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSec = 60;
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const redisKey = `rl:subkey:${subkeyId}:${windowStart}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);
  const remaining = Math.max(limit - count, 0);
  const reset = windowStart + windowSec;
  return { remaining, reset, limit, allowed: count <= limit };
}

fastify.addHook('onRequest', async (req) => {
  req._startedAt = Date.now();
});
fastify.addHook('onResponse', async (req, reply) => {
  const ms = Date.now() - (req._startedAt || Date.now());
  req.log.info({ method: req.method, path: req.url, status: reply.statusCode, ms }, 'request metrics');
});

fastify.setErrorHandler(async (err, req, reply) => {
  req.log.error({ err }, 'request failed');
  try {
    await query(
      `INSERT INTO app_error_logs (id,request_id,method,path,message,stack) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), req.id || null, req.method, req.url, String(err.message || err), String(err.stack || '')],
    );
  } catch (_) {}
  return reply.code(err.statusCode || 500).send(ERR('INTERNAL_ERROR', err.message || 'internal error'));
});

fastify.get('/health', async () => ({ status: 'ok', ts: Date.now(), request_id: randomUUID() }));

fastify.get('/health/db', async (req, reply) => {
  try {
    await query('SELECT 1');
    return { ok: true };
  } catch (e) {
    return reply.code(500).send(ERR('DB_UNHEALTHY', e.message || 'db unavailable'));
  }
});

fastify.get('/health/redis', async (req, reply) => {
  try {
    await redis.ping();
    return { ok: true };
  } catch (e) {
    return reply.code(500).send(ERR('REDIS_UNHEALTHY', e.message || 'redis unavailable'));
  }
});

fastify.get('/api/health', async () => {
  const { rows } = await query(`SELECT day, internal_ok, db_ok, redis_ok, details FROM health_daily ORDER BY day DESC LIMIT 90`);
  return rows.reverse();
});

fastify.post('/api/health/refresh-now', async (req, reply) => {
  const auth = await requireOrgRole(req, reply, ['owner', 'admin']); if (!auth) return;
  try {
    let db_ok = false; let redis_ok = false;
    try { await query('SELECT 1'); db_ok = true; } catch (_) {}
    try { await redis.ping(); redis_ok = true; } catch (_) {}
    const internal_ok = db_ok && redis_ok;
    await query(
      `INSERT INTO health_daily (day, internal_ok, db_ok, redis_ok, details, updated_at)
       VALUES (CURRENT_DATE, $1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (day) DO UPDATE SET internal_ok=EXCLUDED.internal_ok, db_ok=EXCLUDED.db_ok, redis_ok=EXCLUDED.redis_ok, details=EXCLUDED.details, updated_at=NOW()`,
      [internal_ok, db_ok, redis_ok, JSON.stringify({ refreshed_manually: true, checked_at: Date.now() })],
    );
    return { success: true, internal_ok, db_ok, redis_ok };
  } catch (e) {
    return reply.code(500).send(ERR('HEALTH_REFRESH_FAILED', e.message || 'health refresh failed'));
  }
});

fastify.get('/api/admin/error-logs', async (req, reply) => {
  const auth = await requireOrgRole(req, reply, ['owner', 'admin']); if (!auth) return;
  const limitRaw = Number(req.query?.limit || 100);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? Math.round(limitRaw) : 100));
  const before = req.query?.before ? Number(req.query.before) : null;
  if (before && Number.isFinite(before)) {
    const { rows } = await query(
      `SELECT id,request_id,method,path,message,EXTRACT(EPOCH FROM created_at)::bigint AS created_at
       FROM app_error_logs
       WHERE EXTRACT(EPOCH FROM created_at)::bigint < $1
       ORDER BY created_at DESC LIMIT $2`,
      [before, limit],
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT id,request_id,method,path,message,EXTRACT(EPOCH FROM created_at)::bigint AS created_at
     FROM app_error_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
});


fastify.get('/api/me', async (req, reply) => {
  const auth = await requireAuth(req, reply); if (!auth) return;
  const organizations = await loadUserOrganizations(auth.user.id);
  return { user: auth.user, organization: auth.organization, organizations };
});

async function getProject(req, reply) {
  const auth = await requireAuth(req, reply); if (!auth) return null;
  const projectRef = String(req.headers['x-project-id'] || '').trim();
  if (!projectRef) {
    reply.code(400).send(ERR('MISSING_PROJECT_HEADER', 'Missing x-project-id header'));
    return null;
  }
  const { rows } = await query(
    `SELECT p.id,p.name,p.slug,p.status,p.organization_id,om.role AS organization_role
     FROM projects p
     JOIN organization_members om ON om.organization_id = p.organization_id AND om.user_id = $2
     WHERE (p.id::text = $1 OR p.slug = $1)
     LIMIT 1`,
    [projectRef, auth.user.id],
  );
  const project = rows[0];
  if (!project) {
    reply.code(404).send(ERR('PROJECT_NOT_FOUND', 'project not found'));
    return null;
  }
  if (project.status !== 'active') {
    reply.code(403).send(ERR('PROJECT_INACTIVE', 'project is not active'));
    return null;
  }
  req.projectRole = project.organization_role;
  return project;
}

fastify.get('/api/projects', async (req, reply) => {
  const auth = await requireAuth(req, reply); if (!auth) return;
  const { rows } = await query(
    `SELECT p.id,p.name,p.slug,p.status,p.organization_id,om.role AS organization_role,EXTRACT(EPOCH FROM p.created_at)::bigint AS created_at
     FROM projects p
     JOIN organization_members om ON om.organization_id = p.organization_id AND om.user_id = $1
     ORDER BY p.created_at DESC`,
    [auth.user.id],
  );
  return rows;
});

fastify.post('/api/projects', {
  schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, slug: { type: 'string' } } } },
}, async (req, reply) => {
  const { name, slug = null } = req.body || {};
  if (!name) return reply.code(400).send(ERR('VALIDATION_ERROR', 'name required'));
  const auth = await requireOrgRole(req, reply, ['owner', 'admin']); if (!auth) return;
  const { rows: countRows } = await query('SELECT COUNT(*)::int AS c FROM projects WHERE organization_id = $1', [auth.organization.id]);
  if ((countRows[0]?.c || 0) >= 3) return reply.code(400).send(ERR('PROJECT_LIMIT_REACHED', 'max 3 projects allowed for now'));
  const id = randomUUID();
  const generatedSlug = `project-${Math.random().toString(36).slice(2, 10)}`;
  await query(`INSERT INTO projects (id,name,slug,status,organization_id) VALUES ($1,$2,$3,$4,$5)`, [id, String(name).trim(), slug ? String(slug).trim() : generatedSlug, 'active', auth.organization.id]);
  return { id, name: String(name).trim(), slug: slug ? String(slug).trim() : generatedSlug, status: 'active', created_at: Math.floor(Date.now()/1000) };
});

async function deleteProjectByRef(req, reply, projectRef) {
  const auth = await requireOrgRole(req, reply, ['owner', 'admin']); if (!auth) return null;
  const ref = String(projectRef || '').trim();
  if (!ref) return { success: true, deleted: false, reason: 'empty_ref' };
  const { rows } = await query(
    `SELECT p.id,p.slug FROM projects p
     JOIN organization_members om ON om.organization_id = p.organization_id AND om.user_id = $2
     WHERE (p.slug = $1 OR p.id::text = $1) LIMIT 1`,
    [ref, auth.user.id],
  );
  const project = rows[0];
  if (!project) return { success: true, deleted: false, reason: 'not_found' };
  await query('DELETE FROM projects WHERE id = $1', [project.id]);
  return { success: true, deleted: true, id: project.id, slug: project.slug };
}

fastify.delete('/api/projects/:id', {
  schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } } },
}, async (req, reply) => {
  try {
    return await deleteProjectByRef(req, reply, req.params.id);
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(ERR('INTERNAL_ERROR', 'failed to delete project'));
  }
});



fastify.route({
  method: ['DELETE'],
  url: '/api/projects/by-slug/:slug',
  handler: async (req, reply) => {
    try {
      return await deleteProjectByRef(req, reply, req.params.slug);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ success: false, deleted: false, reason: 'internal_error' });
    }
  },
});

fastify.get('/api/master-keys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { rows } = await query(`
    SELECT id, provider, name, key_masked, key_version,
           EXTRACT(EPOCH FROM created_at)::bigint AS created_at,
           EXTRACT(EPOCH FROM updated_at)::bigint AS updated_at
    FROM master_keys WHERE project_id = $1 ORDER BY created_at DESC
  `, [project.id]);
  return rows;
});

fastify.post('/api/master-keys', {
  schema: { body: { type: 'object', required: ['provider', 'api_key'], properties: { provider: { type: 'string' }, api_key: { type: 'string', minLength: 1 }, name: { type: 'string' } } } },
}, async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  const { provider, api_key, name } = req.body || {};
  if (!provider || !api_key) return reply.code(400).send(ERR('VALIDATION_ERROR', 'provider and api_key required'));
  if (!getProvider(provider)) return reply.code(400).send(ERR('UNKNOWN_PROVIDER', `Unknown provider ${provider}`));
  const encrypted = encryptSecret(api_key, provider);
  await query(
    `INSERT INTO master_keys (id, project_id, provider, name, key_masked, ciphertext_b64, iv_b64, auth_tag_b64, key_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), project.id, provider, name || provider, maskKey(api_key), encrypted.ciphertext_b64, encrypted.iv_b64, encrypted.auth_tag_b64, encrypted.key_version],
  );
  return { success: true };
});


fastify.delete('/api/master-keys/:id', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  const { id } = req.params;
  try {
    await query('BEGIN');
    await query('UPDATE subkeys SET master_key_id = NULL WHERE master_key_id = $1 AND project_id = $2', [id, project.id]);
    const result = await query('DELETE FROM master_keys WHERE id = $1 AND project_id = $2', [id, project.id]);
    await query('COMMIT');
    if (!result.rowCount) return reply.code(404).send({ error: 'master key not found' });
    return { success: true };
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    if (/invalid input syntax for type uuid/i.test(String(err?.message || ''))) {
      return reply.code(400).send({ error: 'invalid master key id' });
    }
    throw err;
  }
});

fastify.delete('/api/subkeys/:id', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin', 'member'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  await query('DELETE FROM subkeys WHERE id = $1 AND project_id = $2', [req.params.id, project.id]);
  return { success: true };
});

fastify.get('/api/subkeys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { rows } = await query(`SELECT id, name, token_prefix, token_ciphertext_b64, token_iv_b64, token_auth_tag_b64, provider, master_key_id, auto_route_on_exhausted, monthly_token_limit, requests_per_minute_limit, tokens_used, status, spend_limit_usd, max_requests, request_count, allowed_models, EXTRACT(EPOCH FROM expires_at)::bigint AS expires_at, EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM subkeys WHERE project_id = $1 ORDER BY created_at DESC`, [project.id]);
  return rows.map((row) => {
    let token_preview = `${row.token_prefix || 'sk-kg-'}••••`;
    if (row.token_prefix && row.token_ciphertext_b64 && row.token_iv_b64 && row.token_auth_tag_b64) {
      try {
        const token = decryptSecret({ ciphertext_b64: row.token_ciphertext_b64, iv_b64: row.token_iv_b64, auth_tag_b64: row.token_auth_tag_b64 }, `subkey:${row.id}`);
        token_preview = `${token.slice(0, 12)}••••••••${token.slice(-4)}`;
      } catch (_) {}
    }
    return { ...row, token_preview, token: undefined, token_ciphertext_b64: undefined, token_iv_b64: undefined, token_auth_tag_b64: undefined };
  });
});

fastify.get('/api/subkeys/:id/demo-token', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const ip = req.ip || 'unknown';
  const demoKey = `rl:demo-token:${project.id}:${ip}`;
  const demoCount = await redis.incr(demoKey);
  if (demoCount === 1) await redis.expire(demoKey, 60);
  if (demoCount > 20) return reply.code(429).send(ERR('RATE_LIMITED', 'too many demo token requests'));
  const { rows } = await query(
    `SELECT id, status, token_ciphertext_b64, token_iv_b64, token_auth_tag_b64
     FROM subkeys WHERE id = $1 AND project_id = $2 LIMIT 1`,
    [req.params.id, project.id],
  );
  const row = rows[0];
  if (!row) return reply.code(404).send(ERR('SUBKEY_NOT_FOUND', 'subkey not found'));
  if (row.status !== 'active') return reply.code(403).send(ERR('SUBKEY_INACTIVE', 'subkey is not active'));
  if (!row.token_ciphertext_b64 || !row.token_iv_b64 || !row.token_auth_tag_b64) {
    return reply.code(400).send(ERR('TOKEN_NOT_AVAILABLE', 'token not available'));
  }
  const token = decryptSecret(
    { ciphertext_b64: row.token_ciphertext_b64, iv_b64: row.token_iv_b64, auth_tag_b64: row.token_auth_tag_b64 },
    `subkey:${row.id}`,
  );
  return { token };
});

fastify.patch('/api/subkeys/:id', {
  schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
}, async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin', 'member'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  const { id } = req.params;
  const body = req.body || {};
  const updates = [];
  const values = [];

  if (body.status !== undefined) {
    if (!['active', 'paused', 'revoked'].includes(body.status)) return reply.code(400).send(ERR('VALIDATION_ERROR', 'status must be active|paused|revoked'));
    updates.push(`status = $${values.length + 1}`);
    values.push(body.status);
  }
  if (body.monthly_token_limit !== undefined) {
    const v = Number(body.monthly_token_limit);
    if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'monthly_token_limit must be a positive number' });
    updates.push(`monthly_token_limit = $${values.length + 1}`);
    values.push(Math.round(v));
  }
  if (body.max_requests !== undefined) {
    const v = Number(body.max_requests);
    if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'max_requests must be a positive number' });
    updates.push(`max_requests = $${values.length + 1}`);
    values.push(Math.round(v));
  }
  if (body.expires_in_days !== undefined) {
    if (body.expires_in_days === null || body.expires_in_days === '') {
      updates.push(`expires_at = NULL`);
    } else {
      const v = Number(body.expires_in_days);
      if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'expires_in_days must be a positive number or null' });
      updates.push(`expires_at = NOW() + ($${values.length + 1} || ' days')::interval`);
      values.push(String(Math.round(v)));
    }
  }

  if (!updates.length) return reply.code(400).send({ error: 'no editable fields provided' });
  values.push(id);
  values.push(project.id);
  const { rows } = await query(`UPDATE subkeys SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND project_id = $${values.length} RETURNING id,name,provider,monthly_token_limit,max_requests,status,EXTRACT(EPOCH FROM expires_at)::bigint AS expires_at`, values);
  if (!rows[0]) return reply.code(404).send(ERR('SUBKEY_NOT_FOUND', 'subkey not found'));
  return { success: true, subkey: rows[0] };
});

fastify.post('/api/subkeys', {
  schema: { body: { type: 'object', required: ['name', 'provider'], properties: { name: { type: 'string', minLength: 1 }, provider: { type: 'string' }, master_key_id: { type: ['string', 'null'] } } } },
}, async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin', 'member'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  const { name, provider, master_key_id = null, auto_route_on_exhausted = false, monthly_token_limit = 50000, max_requests = 5000, allowed_models = ['all'], spend_limit_usd = null, expires_in_days = null } = req.body || {};
  if (!name || !provider) return reply.code(400).send(ERR('VALIDATION_ERROR', 'name and provider required'));
  const providerConfig = getProvider(provider);
  if (!providerConfig) return reply.code(400).send(ERR('UNKNOWN_PROVIDER', `Unknown provider ${provider}`));
  const normalizedAllowed = normalizeAllowedModels(allowed_models);
  const invalidModels = normalizedAllowed.includes('all') ? [] : normalizedAllowed.filter((model) => !isModelAllowedForProvider(provider, model));
  if (invalidModels.length) return reply.code(400).send(ERR('MODEL_PROVIDER_MISMATCH', `Models not valid for ${provider}: ${invalidModels.join(', ')}`));
  const storedAllowed = normalizedAllowed.includes('all') ? ['all'] : normalizedAllowed.map((model) => normalizeProviderModel(provider, model));
  const id = randomUUID();
  const token = `sk-kg-${randomUUID().replace(/-/g, '')}`;
  const enc = encryptSecret(token, `subkey:${id}`);
  const expiresAt = expires_in_days ? new Date(Date.now() + Number(expires_in_days) * 86400 * 1000) : null;
  await query(`INSERT INTO subkeys (id,project_id,name,token_hash,token_prefix,token_ciphertext_b64,token_iv_b64,token_auth_tag_b64,token_key_version,provider,master_key_id,auto_route_on_exhausted,monthly_token_limit,requests_per_minute_limit,spend_limit_usd,max_requests,allowed_models,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, [id, project.id, name, hashToken(token), token.slice(0, 12), enc.ciphertext_b64, enc.iv_b64, enc.auth_tag_b64, enc.key_version, provider, master_key_id, Boolean(auto_route_on_exhausted), Number(monthly_token_limit) || 50000, DEFAULT_RPM_LIMIT, spend_limit_usd, Number(max_requests) || 5000, JSON.stringify(storedAllowed), expiresAt]);
  return { id, name, provider, token_prefix: token.slice(0, 12), token, requests_per_minute_limit: DEFAULT_RPM_LIMIT };
});

fastify.get('/api/providers', async () => ({ providers: listProviders() }));
fastify.get('/api/models', async (req) => ({ data: listModels(req.query?.provider) }));

fastify.get('/api/analytics', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const [{ rows: totals }, { rows: logs }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_requests, COALESCE(SUM(tokens_used),0)::int AS total_tokens FROM request_logs WHERE project_id = $1`, [project.id]),
    query(`SELECT id,request_id,subkey_id,subkey_name,provider,model,tokens_used,prompt_tokens,completion_tokens,estimated_cost_usd,status,error_reason,source,latency_ms,EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM request_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200`, [project.id]),
  ]);
  const totalRequests = totals[0]?.total_requests || 0;
  const totalTokens = totals[0]?.total_tokens || 0;
  const avgLatency = logs.length ? Math.round(logs.reduce((s, r) => s + Number(r.latency_ms || 0), 0) / logs.length) : 0;
  const topModels = [...logs.reduce((m, r) => (m.set(r.model || 'unknown', (m.get(r.model || 'unknown') || 0) + 1), m), new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([model, count]) => ({ model, count }));
  const costAttribution = logs.map((l) => ({
    provider: l.provider || 'unknown',
    model: l.model || 'unknown',
    est_cost_usd: Number(l.estimated_cost_usd || 0),
  }));
  return { totalRequests, totalTokens, avgLatency, topModels, logs, costAttribution };
});

fastify.get('/api/quota-requests', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  await query(`DELETE FROM quota_requests WHERE project_id = $1 AND status IN ('approved','rejected') AND created_at < NOW() - INTERVAL '24 hours'`, [project.id]);
  const { rows } = await query(`SELECT q.id,q.subkey_id,s.name AS subkey_name,q.request_type,q.amount,q.note,q.status,EXTRACT(EPOCH FROM q.created_at)::bigint AS created_at FROM quota_requests q LEFT JOIN subkeys s ON s.id=q.subkey_id WHERE q.project_id = $1 ORDER BY q.created_at DESC`, [project.id]);
  return rows;
});


fastify.patch('/api/quota-requests/:id', {
  schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, body: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } },
}, async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  if (!['owner', 'admin', 'member'].includes(project.organization_role)) return reply.code(403).send(ERR('FORBIDDEN', 'Your organization role does not allow this action.'));
  if (!isUuid(req.params.id)) return reply.code(400).send(ERR('INVALID_ID', 'invalid quota request id'));
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return reply.code(400).send(ERR('VALIDATION_ERROR', 'status must be approved|rejected|pending'));
  const { rows } = await query('UPDATE quota_requests SET status = $1 WHERE id = $2 AND project_id = $3 RETURNING *', [status, req.params.id, project.id]);
  const r = rows[0];
  if (r && status === 'approved') {
    if (r.request_type === 'credits' && r.amount) {
      const add = Math.max(0, Number(String(r.amount).replace(/[^0-9.]/g, '')) || 0) * 1000;
      await query('UPDATE subkeys SET monthly_token_limit = COALESCE(monthly_token_limit,0) + $1 WHERE id = $2', [Math.round(add), r.subkey_id]);
    }
    if (r.request_type === 'expiry_extend' && r.amount) {
      const days = Math.max(0, Number(String(r.amount).replace(/[^0-9.]/g, '')) || 0);
      await query("UPDATE subkeys SET expires_at = COALESCE(expires_at, NOW()) + ($1 || ' days')::interval WHERE id = $2", [String(Math.round(days)), r.subkey_id]);
    }
  }
  await query(`DELETE FROM quota_requests WHERE project_id = $1 AND status IN ('approved','rejected') AND created_at < NOW() - INTERVAL '24 hours'`, [project.id]);
  return { success: true };
});

fastify.post('/api/quota-requests', {
  schema: { body: { type: 'object', required: ['subkey_id', 'request_type'], properties: { subkey_id: { type: 'string' }, request_type: { type: 'string' }, amount: { type: ['string', 'null'] }, note: { type: 'string' } } } },
}, async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { subkey_id, request_type, amount = null, note = '' } = req.body || {};
  if (!subkey_id || !request_type) return reply.code(400).send(ERR('VALIDATION_ERROR', 'subkey_id and request_type required'));
  const id = randomUUID();
  await query(`INSERT INTO quota_requests (id,project_id,subkey_id,request_type,amount,note,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, project.id, subkey_id, request_type, amount ? String(amount) : null, note, 'pending']);
  return { success: true, id };
});


async function loadSubkeyFromBearer(req, reply, payload = {}) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    req.log.warn({ event: 'gateway_request_rejected', error_reason: 'missing_authorization', provider: null, model: payload.model || null }, 'gateway request rejected');
    reply.code(401).send(ERR('MISSING_AUTHORIZATION', 'Missing Authorization header.'));
    return null;
  }

  const { rows } = await query(`SELECT id,project_id,name,provider,master_key_id,auto_route_on_exhausted,status,requests_per_minute_limit,max_requests,request_count,monthly_token_limit,tokens_used,expires_at,allowed_models FROM subkeys WHERE token_hash = $1`, [hashToken(bearer)]);
  const subkey = rows[0];
  if (!subkey) {
    req.log.warn({ event: 'gateway_request_rejected', error_reason: 'invalid_token', provider: null, model: payload.model || null }, 'gateway request rejected');
    reply.code(401).send(ERR('INVALID_TOKEN', 'Invalid subkey.'));
    return null;
  }
  return subkey;
}

function getAllowedModelIds(subkey) {
  const provider = getProvider(subkey.provider);
  if (!provider) return [];
  const allowedModels = normalizeAllowedModels(subkey.allowed_models);
  if (allowedModels.includes('all')) return provider.models.map((model) => model.id);
  return allowedModels.map((model) => normalizeProviderModel(subkey.provider, model)).filter(Boolean);
}

function modelObject(modelId) {
  return { id: modelId, object: 'model', created: 0, owned_by: 'keygate' };
}

function completionPromptToMessages(prompt) {
  if (Array.isArray(prompt)) return [{ role: 'user', content: prompt.join('\n') }];
  return [{ role: 'user', content: String(prompt ?? '') }];
}

function responsesInputToMessages(input) {
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (item?.role && item?.content !== undefined) return { role: item.role, content: item.content };
      return { role: 'user', content: typeof item === 'string' ? item : JSON.stringify(item) };
    });
  }
  return [{ role: 'user', content: String(input ?? '') }];
}

function toResponsesResponse(chatBody = {}, requestedModel = null) {
  const choice = chatBody.choices?.[0] || {};
  const text = choice.message?.content || choice.text || '';
  return {
    id: chatBody.id || `resp_${randomUUID().replace(/-/g, '')}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: chatBody.model || requestedModel,
    output: [{ id: `msg_${randomUUID().replace(/-/g, '')}`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
    output_text: text,
    usage: chatBody.usage || {},
  };
}

async function handleGatewayCompletion(req, reply, { endpoint = 'chat' } = {}) {
  const started = Date.now();
  const originalPayload = req.body || {};
  const source = req.headers['x-keygate-client'] || 'external';
  const finishMs = () => Date.now() - started;
  const subkey = await loadSubkeyFromBearer(req, reply, originalPayload);
  if (!subkey) return;

  const payload = endpoint === 'completions'
    ? { ...originalPayload, messages: completionPromptToMessages(originalPayload.prompt) }
    : endpoint === 'responses'
      ? { ...originalPayload, messages: responsesInputToMessages(originalPayload.input) }
      : originalPayload;
  const requestedModel = normalizeProviderModel(subkey.provider, payload.model || getDefaultModel(subkey.provider)) || null;

  const logAndReject = async (httpCode, errorCode, message, status, errorReason) => {
    await insertRequestLog({ req, subkey, model: requestedModel, status, errorReason, source, latencyMs: finishMs() });
    return reply.code(httpCode).send(ERR(errorCode, message));
  };

  if (subkey.status !== 'active') return logAndReject(403, 'SUBKEY_INACTIVE', `Subkey is ${subkey.status}.`, 'rejected', 'subkey_inactive');
  if (subkey.expires_at && new Date(subkey.expires_at).getTime() < Date.now()) return logAndReject(403, 'SUBKEY_EXPIRED', 'Subkey expired.', 'rejected', 'subkey_expired');
  if (Number(subkey.request_count || 0) >= Number(subkey.max_requests || 5000)) return logAndReject(403, 'MAX_REQUESTS_REACHED', 'Max requests reached.', 'max_requests_reached', 'max_requests_reached');
  if (Number(subkey.tokens_used || 0) >= Number(subkey.monthly_token_limit || 0)) return logAndReject(403, 'QUOTA_EXCEEDED', 'Quota reached for this subkey. Please use /api/quota-requests endpoint to request a quota extension.', 'quota_reached', 'quota_exceeded');

  const rate = await rateLimitBySubkey(subkey.id, Number(subkey.requests_per_minute_limit || DEFAULT_RPM_LIMIT));
  reply.header('X-RateLimit-Limit', String(rate.limit));
  reply.header('X-RateLimit-Remaining', String(rate.remaining));
  reply.header('X-RateLimit-Reset', String(rate.reset));
  if (!rate.allowed) return logAndReject(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Try again later.', 'rate_limited', 'rate_limit_exceeded');

  const providerConfig = getProvider(subkey.provider);
  if (!providerConfig) return logAndReject(400, 'UNKNOWN_PROVIDER', `Unknown provider ${subkey.provider}`, 'config_error', 'unknown_provider');
  const modelOwner = getProviderForModel(requestedModel);
  if (!modelOwner) return logAndReject(400, 'UNKNOWN_MODEL', `Unknown model ${requestedModel}`, 'rejected', 'unknown_model');
  if (modelOwner.id !== subkey.provider) return logAndReject(400, 'MODEL_PROVIDER_MISMATCH', `Model ${requestedModel} does not match provider ${subkey.provider}`, 'rejected', 'model_provider_mismatch');
  if (!getAllowedModelIds(subkey).includes(requestedModel)) return logAndReject(403, 'MODEL_NOT_ALLOWED', 'Model not allowed for this subkey.', 'rejected', 'model_not_allowed');

  const mkQuery = subkey.master_key_id
    ? query('SELECT * FROM master_keys WHERE id = $1 AND provider = $2 AND project_id = $3 LIMIT 1', [subkey.master_key_id, subkey.provider, subkey.project_id])
    : query('SELECT * FROM master_keys WHERE provider = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1', [subkey.provider, subkey.project_id]);
  const { rows: mkRows } = await mkQuery;
  const mk = mkRows[0];
  if (!mk) return logAndReject(400, 'MASTER_KEY_MISSING', `No master key found for provider ${subkey.provider}.`, 'config_error', 'master_key_missing');

  const providerKey = decryptSecret(mk, subkey.provider);
  let status = 'success'; let errorReason = null; let responseBody; let statusCode = 200;
  let tokensUsed = 0; let promptTokens = 0; let completionTokens = 0; let estimatedCostUsd = 0;
  try {
    const upstream = await callProvider({ provider: providerConfig, apiKey: providerKey, payload, model: requestedModel });
    const rawBody = await upstream.json().catch(() => ({}));
    responseBody = normalizeProviderResponse(providerConfig, rawBody, upstream.ok);
    statusCode = upstream.status;
    if (!upstream.ok) {
      status = upstream.status === 429 ? 'rate_limited' : 'error';
      errorReason = upstream.status === 429 ? 'upstream_rate_limited' : 'upstream_error';
    }
    const usage = normalizeUsage(responseBody);
    tokensUsed = usage.totalTokens;
    promptTokens = usage.promptTokens;
    completionTokens = usage.completionTokens;
    estimatedCostUsd = estimateCostUsd(subkey.provider, requestedModel, promptTokens, completionTokens, tokensUsed);
  } catch (e) {
    status = 'error'; errorReason = 'upstream_exception'; responseBody = { error: { message: e.message || 'Upstream request failed', type: 'upstream_error' } }; statusCode = 502;
  }

  await insertRequestLog({ req, subkey, model: requestedModel, tokensUsed, promptTokens, completionTokens, status, errorReason, source, latencyMs: finishMs(), estimatedCostUsd });
  await query(`UPDATE subkeys SET tokens_used = COALESCE(tokens_used,0) + $1, request_count = COALESCE(request_count,0) + 1 WHERE id = $2`, [tokensUsed, subkey.id]);
  if (statusCode >= 400) return reply.code(statusCode).send(responseBody);
  if (endpoint === 'completions') return reply.code(statusCode).send(toOpenAIChatCompletionResponse(responseBody));
  if (endpoint === 'responses') return reply.code(statusCode).send(toResponsesResponse(responseBody, requestedModel));
  return reply.code(statusCode).send(responseBody);
}

fastify.get('/v1/models', async (req, reply) => {
  const subkey = await loadSubkeyFromBearer(req, reply);
  if (!subkey) return;
  return { object: 'list', data: getAllowedModelIds(subkey).map(modelObject) };
});

async function handleModelRetrieve(req, reply) {
  const requested = req.params.model || req.params['*'];
  const subkey = await loadSubkeyFromBearer(req, reply, { model: requested });
  if (!subkey) return;
  const model = normalizeProviderModel(subkey.provider, requested);
  if (!model || !getAllowedModelIds(subkey).includes(model)) return reply.code(404).send(ERR('MODEL_NOT_FOUND', 'Model not found for this subkey.'));
  return modelObject(model);
}

const OPENAI_ENDPOINT_COVERAGE = [
  { method: 'GET', path: '/v1/models', category: 'models', status: 'supported' },
  { method: 'GET', path: '/v1/models/{model}', category: 'models', status: 'supported' },
  { method: 'POST', path: '/v1/chat/completions', category: 'responses_chat_completions', status: 'supported' },
  { method: 'POST', path: '/v1/responses', category: 'responses_chat_completions', status: 'supported' },
  { method: 'POST', path: '/v1/responses/create', category: 'responses_chat_completions', status: 'supported_alias' },
  { method: 'GET', path: '/v1/responses/{response_id}', category: 'responses_chat_completions', status: 'declared_not_supported' },
  { method: 'DELETE', path: '/v1/responses/{response_id}', category: 'responses_chat_completions', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/responses/{response_id}/cancel', category: 'responses_chat_completions', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/responses/{response_id}/input_items', category: 'responses_chat_completions', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/completions', category: 'legacy_completions', status: 'supported_compatibility' },
  { method: 'POST', path: '/v1/audio/speech', category: 'audio', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/audio/transcriptions', category: 'audio', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/audio/translations', category: 'audio', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/images/generations', category: 'images', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/images/edits', category: 'images', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/images/variations', category: 'images', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/embeddings', category: 'embeddings', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/files', category: 'files', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/files', category: 'files', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/files/{file_id}', category: 'files', status: 'declared_not_supported' },
  { method: 'DELETE', path: '/v1/files/{file_id}', category: 'files', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/files/{file_id}/content', category: 'files', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/fine_tuning/jobs', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/fine_tuning/jobs', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/fine_tuning/jobs/{job_id}', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/fine_tuning/jobs/{job_id}/cancel', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/fine_tuning/jobs/{job_id}/events', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/fine_tuning/jobs/{job_id}/checkpoints', category: 'fine_tuning', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/assistants', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/assistants', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/assistants/{assistant_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/assistants/{assistant_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'DELETE', path: '/v1/assistants/{assistant_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'DELETE', path: '/v1/threads/{thread_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/messages', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/messages', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/messages/{message_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/messages/{message_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'DELETE', path: '/v1/threads/{thread_id}/messages/{message_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/runs', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/runs', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/runs', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/runs/{run_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/runs/{run_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/runs/{run_id}/cancel', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/runs/{run_id}/steps', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'GET', path: '/v1/threads/{thread_id}/runs/{run_id}/steps/{step_id}', category: 'assistants_threads', status: 'declared_not_supported' },
  { method: 'POST', path: '/v1/moderations', category: 'moderation', status: 'declared_not_supported' },
];

function unsupportedOpenAIEndpoint(category, route) {
  return async (req, reply) => {
    const subkey = await loadSubkeyFromBearer(req, reply, req.body || {});
    if (!subkey) return;
    return reply.code(501).send({
      error: {
        code: 'ENDPOINT_NOT_SUPPORTED_BY_KEYGATE',
        message: `${route} is declared for OpenAI compatibility coverage, but KeyGate does not proxy the ${category} API yet.`,
        category,
        route,
        supported_endpoints: OPENAI_ENDPOINT_COVERAGE.filter((item) => item.status.startsWith('supported')).map((item) => `${item.method} ${item.path}`),
      },
    });
  };
}

fastify.get('/v1', async () => ({ object: 'endpoint_coverage', data: OPENAI_ENDPOINT_COVERAGE }));
fastify.get('/v1/models/:model', handleModelRetrieve);
fastify.get('/v1/models/*', handleModelRetrieve);

fastify.post('/v1/chat/completions', async (req, reply) => handleGatewayCompletion(req, reply, { endpoint: 'chat' }));
fastify.post('/v1/completions', async (req, reply) => handleGatewayCompletion(req, reply, { endpoint: 'completions' }));
fastify.post('/v1/responses', async (req, reply) => handleGatewayCompletion(req, reply, { endpoint: 'responses' }));
fastify.post('/v1/responses/create', async (req, reply) => handleGatewayCompletion(req, reply, { endpoint: 'responses' }));
fastify.route({ method: ['GET', 'DELETE'], url: '/v1/responses/:response_id', handler: unsupportedOpenAIEndpoint('responses_chat_completions', '/v1/responses/{response_id}') });
fastify.post('/v1/responses/:response_id/cancel', unsupportedOpenAIEndpoint('responses_chat_completions', 'POST /v1/responses/{response_id}/cancel'));
fastify.get('/v1/responses/:response_id/input_items', unsupportedOpenAIEndpoint('responses_chat_completions', 'GET /v1/responses/{response_id}/input_items'));

fastify.post('/v1/audio/speech', unsupportedOpenAIEndpoint('audio', 'POST /v1/audio/speech'));
fastify.post('/v1/audio/transcriptions', unsupportedOpenAIEndpoint('audio', 'POST /v1/audio/transcriptions'));
fastify.post('/v1/audio/translations', unsupportedOpenAIEndpoint('audio', 'POST /v1/audio/translations'));
fastify.post('/v1/images/generations', unsupportedOpenAIEndpoint('images', 'POST /v1/images/generations'));
fastify.post('/v1/images/edits', unsupportedOpenAIEndpoint('images', 'POST /v1/images/edits'));
fastify.post('/v1/images/variations', unsupportedOpenAIEndpoint('images', 'POST /v1/images/variations'));
fastify.post('/v1/embeddings', unsupportedOpenAIEndpoint('embeddings', 'POST /v1/embeddings'));
fastify.route({ method: ['GET', 'POST'], url: '/v1/files', handler: unsupportedOpenAIEndpoint('files', '/v1/files') });
fastify.route({ method: ['GET', 'DELETE'], url: '/v1/files/:file_id', handler: unsupportedOpenAIEndpoint('files', '/v1/files/{file_id}') });
fastify.get('/v1/files/:file_id/content', unsupportedOpenAIEndpoint('files', 'GET /v1/files/{file_id}/content'));
fastify.route({ method: ['GET', 'POST'], url: '/v1/fine_tuning/jobs', handler: unsupportedOpenAIEndpoint('fine_tuning', '/v1/fine_tuning/jobs') });
fastify.get('/v1/fine_tuning/jobs/:job_id', unsupportedOpenAIEndpoint('fine_tuning', 'GET /v1/fine_tuning/jobs/{job_id}'));
fastify.post('/v1/fine_tuning/jobs/:job_id/cancel', unsupportedOpenAIEndpoint('fine_tuning', 'POST /v1/fine_tuning/jobs/{job_id}/cancel'));
fastify.get('/v1/fine_tuning/jobs/:job_id/events', unsupportedOpenAIEndpoint('fine_tuning', 'GET /v1/fine_tuning/jobs/{job_id}/events'));
fastify.get('/v1/fine_tuning/jobs/:job_id/checkpoints', unsupportedOpenAIEndpoint('fine_tuning', 'GET /v1/fine_tuning/jobs/{job_id}/checkpoints'));
fastify.route({ method: ['GET', 'POST'], url: '/v1/assistants', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/assistants') });
fastify.route({ method: ['GET', 'POST', 'DELETE'], url: '/v1/assistants/:assistant_id', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/assistants/{assistant_id}') });
fastify.post('/v1/threads', unsupportedOpenAIEndpoint('assistants_threads', 'POST /v1/threads'));
fastify.route({ method: ['GET', 'POST', 'DELETE'], url: '/v1/threads/:thread_id', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/threads/{thread_id}') });
fastify.route({ method: ['GET', 'POST'], url: '/v1/threads/:thread_id/messages', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/threads/{thread_id}/messages') });
fastify.route({ method: ['GET', 'POST', 'DELETE'], url: '/v1/threads/:thread_id/messages/:message_id', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/threads/{thread_id}/messages/{message_id}') });
fastify.route({ method: ['GET', 'POST'], url: '/v1/threads/:thread_id/runs', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/threads/{thread_id}/runs') });
fastify.post('/v1/threads/runs', unsupportedOpenAIEndpoint('assistants_threads', 'POST /v1/threads/runs'));
fastify.route({ method: ['GET', 'POST'], url: '/v1/threads/:thread_id/runs/:run_id', handler: unsupportedOpenAIEndpoint('assistants_threads', '/v1/threads/{thread_id}/runs/{run_id}') });
fastify.post('/v1/threads/:thread_id/runs/:run_id/cancel', unsupportedOpenAIEndpoint('assistants_threads', 'POST /v1/threads/{thread_id}/runs/{run_id}/cancel'));
fastify.post('/v1/threads/:thread_id/runs/:run_id/submit_tool_outputs', unsupportedOpenAIEndpoint('assistants_threads', 'POST /v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs'));
fastify.get('/v1/threads/:thread_id/runs/:run_id/steps', unsupportedOpenAIEndpoint('assistants_threads', 'GET /v1/threads/{thread_id}/runs/{run_id}/steps'));
fastify.get('/v1/threads/:thread_id/runs/:run_id/steps/:step_id', unsupportedOpenAIEndpoint('assistants_threads', 'GET /v1/threads/{thread_id}/runs/{run_id}/steps/{step_id}'));
fastify.post('/v1/moderations', unsupportedOpenAIEndpoint('moderation', 'POST /v1/moderations'));

async function start() {
  await redis.connect();
  await initDb();
  await query(`CREATE TABLE IF NOT EXISTS health_daily (
    day DATE PRIMARY KEY,
    internal_ok BOOLEAN NOT NULL DEFAULT false,
    db_ok BOOLEAN NOT NULL DEFAULT false,
    redis_ok BOOLEAN NOT NULL DEFAULT false,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS app_error_logs (
    id UUID PRIMARY KEY,
    request_id TEXT,
    method TEXT,
    path TEXT,
    message TEXT NOT NULL,
    stack TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE request_logs
    ADD COLUMN IF NOT EXISTS request_id TEXT,
    ADD COLUMN IF NOT EXISTS provider TEXT,
    ADD COLUMN IF NOT EXISTS error_reason TEXT,
    ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12,6) DEFAULT 0`);
  const { rows: schemaChecks } = await query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='projects') AS projects_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subkeys' AND column_name='token_ciphertext_b64') AS subkeys_token_cipher_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subkeys' AND column_name='token_iv_b64') AS subkeys_token_iv_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subkeys' AND column_name='token_auth_tag_b64') AS subkeys_token_tag_ok,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='health_daily') AS health_ok,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='app_error_logs') AS error_logs_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='request_logs' AND column_name='request_id') AS request_log_request_id_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='request_logs' AND column_name='provider') AS request_log_provider_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='request_logs' AND column_name='error_reason') AS request_log_error_reason_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='request_logs' AND column_name='estimated_cost_usd') AS request_log_cost_ok,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') AS users_ok,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='organizations') AS organizations_ok,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='organization_members') AS organization_members_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='organization_id') AS project_org_ok
  `);
  const c = schemaChecks[0] || {};
  if (!(c.projects_ok && c.subkeys_token_cipher_ok && c.subkeys_token_iv_ok && c.subkeys_token_tag_ok && c.health_ok && c.error_logs_ok && c.request_log_request_id_ok && c.request_log_provider_ok && c.request_log_error_reason_ok && c.request_log_cost_ok && c.users_ok && c.organizations_ok && c.organization_members_ok && c.project_org_ok)) {
    throw new Error('Schema drift detected. Apply migrations in order: 001_initial_postgres.sql, 002_health_monitoring.sql, 003_request_error_logs.sql, 004_request_log_details.sql, 005_auth_organizations.sql');
  }

  const writeDailyHealth = async () => {
    let db_ok = false; let redis_ok = false;
    try { await query('SELECT 1'); db_ok = true; } catch (_) {}
    try { await redis.ping(); redis_ok = true; } catch (_) {}
    const internal_ok = db_ok && redis_ok;
    await query(
      `INSERT INTO health_daily (day, internal_ok, db_ok, redis_ok, details, updated_at)
       VALUES (CURRENT_DATE, $1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (day) DO UPDATE SET internal_ok=EXCLUDED.internal_ok, db_ok=EXCLUDED.db_ok, redis_ok=EXCLUDED.redis_ok, details=EXCLUDED.details, updated_at=NOW()`,
      [internal_ok, db_ok, redis_ok, JSON.stringify({ checked_at: Date.now() })],
    );
  };
  await writeDailyHealth();
  setInterval(writeDailyHealth, 24 * 60 * 60 * 1000);
  const port = 3001;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`🚀 Server running on http://localhost:${port}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
