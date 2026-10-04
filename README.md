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
npm run verify:github-gates
npm run build
```

Pull requests to `main` run the **Merge Gate**, which aggregates Build, TypeScript, Test Suite, Auth Security, Tenant Isolation, No Dummy Data, D1 Schema Stability, RCM Integrity, AI Security, ICOFR Traceability Integrity, Cloudflare Build, and CI supply-chain verification. Production deployment is followed by a separate **Production Gate — Build → Test → Security → Deploy → Smoke** evidence workflow.

GitHub repository settings must additionally protect `main` and require the **Merge Gate** status before merge. The scheduled **Main Protection Audit** fails when `main` is not protected, so configuration drift remains visible.


## Banking RBAC

Total ARC separates multi-institution administration from institution-level administration and operational assurance roles. Server-side authorization recognizes:

- **SystemAdmin** — system / multi-institution administrator with cross-institution administration and global system configuration.
- **Admin** — institution administrator limited to User Administration, Organization, Institution Configuration, and Security Administration. It cannot switch institutions or create/elevate/revoke privileged SystemAdmin/Admin accounts.
- **RiskManager** — risk-management workspace and risk/control maintenance.
- **ComplianceOfficer** — compliance oversight with read-focused access until dedicated compliance mutation workflows are approved.
- **InternalAuditor** — SKAI/internal-audit assurance and testing access with segregation from management scoping/control-design maintenance.
- **ICOFRCoordinator** — ICOFR lifecycle coordination.
- **RCSACoordinator** — RCSA/CSA campaign coordination.
- **ProcessOwner** and **ControlOwner** — first-line ownership roles.
- **EvidenceContributor** — controlled evidence contribution.
- **Tester** — independent test execution.
- **Reviewer** — review/approval workflow.
- **Executive** — management/executive read and certification view.
- **ReadOnlyAuditor** — broad read-only assurance access.

Role checks are applied to pages and API methods. Institution switching remains restricted to the multi-institution **SystemAdmin** role.

## AI Gateway

Total ARC includes a server-side multi-provider AI Gateway. API keys are never exposed to client-side code.

### Routing policy

- **Cloudflare Workers AI** processes `confidential` and `restricted` workloads by default.
- **Google Gemini** is the primary reasoning provider for eligible non-sensitive or sanitized complex analysis.
- **Groq** handles fast chat, classification, summarization, and lightweight inference.
- **OpenRouter** is the last-resort free-model fallback.

The gateway caps request size, applies timeout and retry logic, fails over on provider/quota errors, redacts banking-sensitive identifiers and secrets before eligible external-provider calls, including CIF, bank-account numbers, payment-card numbers, NIK, NPWP, loan-account identifiers, internal employee IDs, and confidential-document metadata, and logs provider metadata without logging prompts or model output.

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


### Full production AI connectivity

The production workflow now validates the complete AI path instead of treating a successful build as proof of connectivity.

Before deployment it validates Cloudflare credentials and D1 access. After deployment it synchronizes any configured external provider keys from GitHub Actions secrets to the Worker, creates a one-time deployment probe token, verifies `/api/ai/ready`, and executes a protected `POST /api/ai/probe` request.

The protected probe performs a small real inference against Cloudflare Workers AI and also probes every external provider that is configured at runtime. Secret values are never returned by the endpoint or printed by the workflow.

Optional external provider GitHub Actions secrets:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`

Cloudflare Workers AI remains the required private provider for confidential/restricted workloads. Gemini, Groq and OpenRouter remain optional fallback/eligible routing providers according to the gateway policy.

The deployment token must be able to access the D1 database required by the current Total ARC production architecture. If the D1 permission preflight fails, deployment stops before building or publishing the Worker.

### Deterministic production D1 binding

The committed `wrangler.jsonc` intentionally keeps `DB` as a template binding. Production deployment does **not** rely on implicit D1 auto-provisioning.

Before every production deploy, GitHub Actions:

1. reads the currently attached `DB` binding from the Cloudflare Worker settings API;
2. reconciles that ID with `wrangler d1 list`;
3. optionally enforces repository variables `TOTALARC_D1_DATABASE_ID` and `TOTALARC_D1_DATABASE_NAME`;
4. generates `wrangler.production.json` with explicit `database_name` and `database_id`;
5. verifies the selected database contains the expected Bank Kalbar institution identity;
6. deploys with `--no-x-provision`; and
7. re-reads the live Worker settings after deployment and fails the deployment if `DB` points to any other D1 database.

An intentional production database migration must be explicitly approved by setting `TOTALARC_ALLOW_D1_REBIND=true` for that deployment. This prevents accidental rebinding when multiple D1 databases exist in the Cloudflare account.


### AI endpoint production guards

Total ARC protects the inference endpoints independently from model-provider quotas:

- `POST /api/ai/chat`: Cloudflare Rate Limiting binding, 20 requests per 60 seconds per temporary actor fingerprint.
- `POST /api/ai/analyze`: Cloudflare Rate Limiting binding, 6 requests per 60 seconds per temporary actor fingerprint.
- Explicit cross-origin browser requests are rejected.
- JSON request bodies are capped at 256 KiB before inference.
- Chat and analysis are forced to `confidential` sensitivity server-side until authenticated server-side data classification is implemented.
- Upstream provider error details are logged server-side and are not returned verbatim to clients.

These AI controls are independent of user authentication and tenant authorization. Browser RoleContext remains presentation state only; authenticated identity, revocable sessions, role authorization, forced password-change gates, and tenant isolation are enforced server-side by middleware and the institution access layer.
