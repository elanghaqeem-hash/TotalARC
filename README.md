# Total ARC (Total Assurance, Risk & Control)

Enterprise Governance, Risk, and Compliance (GRC), Internal Control over Financial Reporting (ICOFR), and Continuous Control Monitoring (CCM) Command Center.

## Overview

**Total ARC** is an enterprise platform for the end-to-end lifecycle of risk assessment, control design and operating-effectiveness testing, deficiency management, remediation, continuous monitoring, and executive attestation.

## Data integrity principle

Operational screens must display records persisted in the connected database. Total ARC does not ship with demo institutions, fake users, simulated transactions, fabricated test results, pre-closed issues, or synthetic monitoring outcomes. Reference taxonomy is managed through committed Cloudflare D1 migrations and never through operational seed data.

## Key Features

- Institution & multi-entity management
- Business Process Architecture (BPM)
- Risk Universe & assessment
- Control Master Library & relational RCM
- RCSA / CSA
- Walkthrough, ToD & ToE
- Deficiency, Root Cause Analysis & MAP
- Continuous Control Monitoring
- ICOFR & financial assertions
- Certification & attestation
- Governed AI integration points

## Tech Stack

- Next.js App Router / TypeScript
- Tailwind CSS
- Prisma ORM with the official Cloudflare D1 driver adapter
- Cloudflare D1 as the single operational persistence layer for local Wrangler development and production
- OpenNext for Cloudflare

## Getting Started

```bash
git clone https://github.com/elanghaqeem-hash/TotalARC.git
cd TotalARC
npm install
npm run prisma:generate
npm run prisma:migration:diff
npm run d1:migrations:local
npm run dev
```

Reference taxonomy is loaded by the committed D1 migration in `migrations/0002_reference_taxonomy.sql`. Register real institutional and operational data through the application or approved integrations; no operational seed is provided.

## Validation

```bash
npm run verify:no-dummy
npm run build
```

The pull-request workflow blocks known dummy operational-data signatures, split-storage regressions, global Prisma clients, and optimistic assurance fallbacks, then verifies the Cloudflare Worker artifact.

## Cloudflare D1 deployment

Production uses the `DB` Cloudflare D1 binding declared in `wrangler.jsonc`. The deployment workflow first deploys the Worker so Wrangler can provision/link the draft D1 binding when needed, then applies committed D1 migrations. The database health endpoint at `GET /api/system/database` is read-only and reports connection, schema/reference readiness, and persisted record counts without creating operational data.

GitHub Actions production deployment requires repository secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never commit or paste these credentials into source files.


## AI Gateway

Total ARC includes a server-side multi-provider AI Gateway. API keys are never exposed to client-side code.

### Routing policy

- **Cloudflare Workers AI** processes `confidential` and `restricted` workloads by default.
- **Google Gemini** is the primary reasoning provider for eligible non-sensitive or sanitized complex analysis.
- **Groq** handles fast chat, classification, summarization, and lightweight inference.
- **OpenRouter** is the last-resort free-model fallback.

The gateway caps request size, applies timeout and retry logic, fails over on provider/quota errors, redacts common identifiers and secrets before eligible external-provider calls, and logs provider metadata without logging prompts or model output.

Default privacy controls:

```text
AI_DEFAULT_SENSITIVITY=confidential
AI_ALLOW_EXTERNAL_FOR_SENSITIVE=false
AI_REDACT_EXTERNAL=true
```

Under this default, confidential/restricted data is not silently forwarded to Gemini, Groq, or OpenRouter when Workers AI is unavailable.

### Provider configuration

Cloudflare Workers AI uses the native `AI` binding declared in `wrangler.jsonc`; it does not require a provider API key.

For local development, copy `.dev.vars.example` to `.dev.vars` and add only the keys you intend to use. For production, configure Gemini, Groq, and OpenRouter keys as Cloudflare runtime secrets/environment variables.

Available variables and model defaults are documented in `.env.example`.

After changing Cloudflare bindings, regenerate environment types if needed:

```bash
npm run cf-typegen
```

### Governed AI endpoints

- `GET /api/ai/status` returns provider readiness without exposing secrets.
- `POST /api/ai/chat` provides the general Total ARC copilot.
- `POST /api/ai/analyze` performs evidence-based process/control analysis using persisted BPM/RCM context.

The AI layer is advisory only and does not autonomously mutate assurance records.
