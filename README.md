# KeyGate

KeyGate is an **API Key Management & AI Access Gateway**.

It lets organizations securely distribute and control AI API access without exposing their real provider API keys.

## The problem

Today, if a company wants to give AI access to employees, clients, contractors, applications, or websites, they often share the real provider key directly:

```text
OpenAI API Key
        ↓
Shared with everyone
```

That creates serious problems:

* Real provider keys can be exposed.
* There are no per-user limits.
* Usage visibility is limited.
* Revocation is difficult.
* Cost control is weak.
* Switching providers is hard.

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

The real provider keys stay hidden inside KeyGate.

Users only receive scoped KeyGate subkeys such as:

```text
sk-kg-xxxx
```

## How it works

### 1. Add provider keys

Admins add provider keys for services such as:

* OpenAI
* Gemini
* Anthropic
* Groq
* DeepSeek
* xAI

KeyGate stores these as encrypted master keys.

### 2. Create scoped subkeys

Admins create subkeys with limits and routing rules.

Example:

```text
Sarfaraz
Quota: 50k tokens
RPM: 5
Provider: Groq

Ayesha
Quota: 20k tokens
RPM: 2
Provider: Gemini
```

Each user, app, or client gets a separate KeyGate token instead of the real provider key.

### 3. Call KeyGate instead of the provider directly

Instead of calling:

```text
https://api.openai.com/v1/chat/completions
```

Clients call:

```text
https://keygate-backend.onrender.com/v1/chat/completions
```

With:

```text
Authorization: Bearer sk-kg-xxxx
```

KeyGate then:

* Validates the subkey.
* Checks quota.
* Enforces rate limits.
* Checks status and expiry.
* Selects the provider.
* Injects the real provider key securely.
* Forwards the request.
* Logs usage.

### 4. Monitor usage

KeyGate logs:

* User/subkey usage.
* Provider and model.
* Token usage.
* Latency.
* Estimated cost.
* Failures.
* Abuse patterns.

## Who KeyGate is for

### Agencies

Give each client a separate AI key with isolated usage and limits.

### SaaS products

Power AI features without exposing provider credentials to end users.

### Teams

Give employees scoped, revocable AI access.

### AI startups

Launch an OpenAI-compatible AI gateway without building infrastructure from scratch.

## What makes KeyGate different

Most API key managers only store secrets.

KeyGate:

* Stores provider keys.
* Creates scoped subkeys.
* Acts as an AI proxy.
* Tracks usage.
* Enforces quotas.
* Supports multiple providers.
* Provides health monitoring.
* Offers an OpenAI-compatible endpoint.

## Simple pitch

**KeyGate is the Stripe of AI API access.**

Organizations store their AI provider keys once, then create secure, rate-limited subkeys for employees, customers, and applications. KeyGate handles routing, quotas, observability, and multi-provider access without exposing real provider credentials.

## Deployment

This project is designed for:

* Backend: Render
* Frontend: Vercel
* PostgreSQL: Neon
* Redis/rate limiting: Upstash

## Project structure

```text
Backend/
  server.js
  db.js
  providers.js
  migrations/

Frontend/
  src/
  public/
  vercel.json
```

## Core backend features

* Fastify API server.
* PostgreSQL persistence.
* Encrypted provider master keys.
* Scoped subkey generation.
* Redis-backed rate limiting.
* OpenAI-compatible chat completions endpoint.
* Request logs and analytics.
* Health checks.

## Core frontend features

* Project console.
* Master key management.
* Subkey management.
* Usage overview.
* Logs.
* Health monitoring.
* Demo request flow.
