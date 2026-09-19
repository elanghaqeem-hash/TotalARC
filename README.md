# Total ARC (Total Assurance, Risk & Control)

Enterprise Governance, Risk, and Compliance (GRC), Internal Control over Financial Reporting (ICOFR), and Continuous Control Monitoring (CCM) Command Center.

## Overview

**Total ARC** is an enterprise platform for the end-to-end lifecycle of risk assessment, control design and operating-effectiveness testing, deficiency management, remediation, continuous monitoring, and executive attestation.

## Data integrity principle

Operational screens must display records persisted in the connected database. Total ARC does not ship with demo institutions, fake users, simulated transactions, fabricated test results, pre-closed issues, or synthetic monitoring outcomes. The optional seed command below loads reference taxonomy only.

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
- Prisma ORM
- SQLite schema for local development; production persistence must use an explicitly provisioned persistent data service compatible with the deployment architecture
- OpenNext for Cloudflare

## Getting Started

```bash
git clone https://github.com/elanghaqeem-hash/TotalARC.git
cd TotalARC
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed-reference
npm run dev
```

The reference seed loads taxonomy only. Register real institutional and operational data through the application or approved integrations.

## Validation

```bash
npm run verify:no-dummy
npm run build
```

The pull-request workflow blocks known dummy operational-data signatures and verifies the Cloudflare Worker artifact.


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


### Production AI readiness

Total ARC exposes a non-inference readiness endpoint:

```text
GET /api/ai/ready
```

It does not call a model and does not consume inference quota. It returns HTTP 200 only when the private Cloudflare Workers AI binding is available at runtime; otherwise it returns HTTP 503.

The production deployment workflow automatically checks this endpoint after a successful Cloudflare deployment. A deployment is therefore not considered AI-ready merely because the source code builds.

Cloudflare CI/CD credentials must be configured outside Git:

- `CLOUDFLARE_API_TOKEN` — GitHub Actions repository secret.
- `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions repository variable (preferred) or repository secret.
- `TOTALARC_PRODUCTION_URL` — optional repository variable used only as a fallback if Wrangler does not emit a deployment URL.

The deploy workflow fails before publishing when required credentials are absent, and it fails after publishing if the Workers AI binding is not runtime-ready.
