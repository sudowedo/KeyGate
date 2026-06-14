# KeyGate

KeyGate is an **API Key Management & AI Access Gateway**.

It lets organizations securely distribute and control AI API access without exposing their real provider API keys.

## The problem

Today, when a company wants to give AI access to employees, clients, contractors, applications, or websites, they often share the real provider key directly:

```text
OpenAI API Key
        ↓
Shared with everyone
```

That creates serious problems:

- Real provider keys can be exposed.
- There are no per-user limits.
- Usage visibility is limited.
- Revocation is difficult.
- Cost control is weak.
- Switching providers is hard.

## What KeyGate does

Instead of sharing real provider keys, organizations store them once inside KeyGate:

```text
OpenAI Key
Gemini Key
Claude Key
Groq Key
DeepSeek Key
xAI Key
      ↓
   KeyGate
      ↓
Scoped Subkeys
      ↓
Users / Apps / Clients
```

The real provider keys stay hidden inside KeyGate. Users only receive scoped KeyGate subkeys such as `sk-kg-xxxx`.

## How it works

1. **Admins add provider keys** for OpenAI, Gemini, Anthropic, Groq, DeepSeek, xAI, and other supported providers. KeyGate stores these as encrypted master keys.
2. **Admins create scoped subkeys** with provider routing, token quotas, request limits, model restrictions, expiry, and status controls.
3. **Users call KeyGate** instead of calling providers directly through the OpenAI-compatible gateway endpoints:

   ```text
   GET  https://keygate-backend.onrender.com/v1
   GET  https://keygate-backend.onrender.com/v1/models
   GET  https://keygate-backend.onrender.com/v1/models/{model}
   POST https://keygate-backend.onrender.com/v1/chat/completions
   POST https://keygate-backend.onrender.com/v1/completions
   POST https://keygate-backend.onrender.com/v1/responses
   POST https://keygate-backend.onrender.com/v1/responses/create
   Authorization: Bearer sk-kg-xxxx
   ```

   KeyGate now has routes for all endpoint categories listed in the OpenAI endpoint breakdown: responses/chat completions, audio, images, embeddings, files, fine-tuning, assistants/threads, moderation, and models. The text/model routes above are supported proxy routes; the other categories are declared and return a clear `501 ENDPOINT_NOT_SUPPORTED_BY_KEYGATE` response until KeyGate implements provider-safe proxying for that category, so clients do not receive ambiguous 404s.

4. **KeyGate validates and proxies the request** by checking quota, rate limits, status, model access, and expiry before injecting the hidden provider key upstream.
5. **Everything is logged** so teams can see usage, providers, models, latency, cost, failures, and abuse patterns.

## Who KeyGate is for

- **Agencies** that need a separate AI key for every client.
- **SaaS products** that want AI features without exposing provider credentials.
- **Teams** that need scoped, revocable employee access.
- **AI startups** that want an OpenAI-compatible gateway without building infrastructure from scratch.

## What makes KeyGate different

Most API key managers only store secrets. KeyGate:

- Stores provider master keys.
- Creates scoped subkeys.
- Acts as an AI proxy.
- Tracks usage.
- Enforces quotas and Redis-backed rate limits.
- Supports multiple providers.
- Provides health monitoring.
- Offers all article-listed OpenAI endpoint categories as concrete routes: supported models, chat completions, legacy completions, and responses proxy routes, plus declared 501 coverage for audio, images, embeddings, files, fine-tuning, assistants/threads, and moderation routes.

## Simple pitch

**KeyGate is the Stripe of AI API access.**

Organizations store their AI provider keys once, then create secure, rate-limited subkeys for employees, customers, and applications. KeyGate handles routing, quotas, observability, and multi-provider access without exposing real provider credentials.

## Deployment stack

- **Backend:** Render
- **Frontend:** Vercel
- **Database:** Neon PostgreSQL
- **Rate limiting:** Upstash Redis
- **Dashboard auth:** Auth0

## Project structure

```text
Backend/
  server.js
  db.js
  auth.js
  providers.js
  migrations/

Frontend/
  src/
  public/
  vercel.json
```

## Required environment variables

### Backend / Render

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
KEYHIVE_MASTER_KEY_BASE64=...
RATE_LIMIT_DEFAULT_PER_MIN=2
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com/
AUTH0_AUDIENCE=https://your-api-identifier
AUTH0_CLIENT_ORIGIN_URL=https://your-vercel-app.vercel.app
```

### Frontend / Vercel

```env
VITE_API_URL=https://keygate-backend.onrender.com
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_CLIENT_ID=your_auth0_spa_client_id
VITE_AUTH0_AUDIENCE=https://your-api-identifier
```

`VITE_AUTH0_CLIENT_ID` is also supported as an alias for `VITE_CLIENT_ID`.

## User data isolation

Dashboard data is scoped by Auth0 user and local organization membership:

```text
Auth0 user → users → organization_members → organizations → projects → master_keys / subkeys / logs
```

A new authenticated user gets a new local organization and starts with no projects. Existing legacy projects with `organization_id IS NULL` are **not** automatically assigned to random signups.

If you intentionally need to claim old pre-auth projects for one owner, set this backend variable before that owner signs in:

```env
KEYGATE_LEGACY_OWNER_EMAILS=owner@example.com
```

Multiple comma-separated emails are supported. Leave it unset in production if every new signup should start fresh.
