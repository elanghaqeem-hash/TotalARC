# Total ARC — Total Assurance, Risk & Control

Total ARC is a multi-tenant enterprise platform for Business Process Management, Risk & Control Matrix (RCM), RCSA/CSA, ICOFR, Test of Design (ToD), Test of Operating Effectiveness (ToE), remediation, Management Action Plans (MAP), retesting, Continuous Control Monitoring (CCM), certification, attestation, tasks, reporting, and auditable governance workflows.

The production-hardening branch is designed around **real PostgreSQL persistence, authenticated tenant isolation, evidence-based assurance conclusions, immutable audit events, and fail-closed behavior when an external integration is not configured**.

## Current architecture

- **Framework:** Next.js 16.3.5 App Router
- **UI:** React 19, TypeScript, Tailwind CSS, Lucide
- **Database:** PostgreSQL
- **ORM:** Prisma 6.19.3
- **Authentication:** signed HttpOnly session cookie, password hashing with scrypt, account lockout, session-version invalidation
- **Authorization:** server-side role checks plus institution/tenant scoping on protected APIs
- **Security controls:** same-origin mutation checks, CSP/security headers, audit logging, dependency audit, CSV formula-injection protection, tenant-isolation CI testing
- **AI:** optional OpenAI-compatible provider; AI routes fail closed when no provider is configured
- **Seed behavior:** reference/master taxonomy only; no transactional demo process, risk, control, testing, issue, MAP, CCM run, or certification data is seeded

## Functional lifecycle

Total ARC is intended to preserve a single source of truth across the assurance lifecycle:

`Institution → Organization → BPM → Risk → Control → RCM → RCSA/CSA → ToD → ToE → Exception → Deficiency → RCA → Issue → MAP → Retest → CCM → Certification / Attestation`

Important workflow rules in the hardening branch include:

- Risk and control data are scoped to the authenticated institution.
- ToD uses **Draft → Submitted → Approved**; only reviewer-approved ToD can affect control health.
- ToE uses **Planned/In Progress → Completed → Reviewed**; only reviewer-reviewed ToE can affect control health.
- Control Health is derived from approved ToD, reviewed ToE, open issues, and CCM evidence instead of optimistic defaults.
- Testing exceptions feed deficiency, root-cause analysis, issue, MAP, retest, and closure workflows.
- CCM does not generate random populations or simulated failures. Runs record supplied verified execution data.
- Certification eligibility is constrained by evidence-derived control health.
- RCSA campaigns use an explicit lifecycle and one current response per campaign/control pair.

## Production database setup

Create a PostgreSQL database and configure the required environment variables. Start from:

```bash
cp .env.example .env.local
```

At minimum configure:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/totalarc?sslmode=require"
SESSION_SECRET="replace-with-a-unique-high-entropy-value-at-least-32-characters"
PLATFORM_ADMIN_EMAILS="admin@example.com"
```

Do **not** commit real database credentials, session secrets, bootstrap passwords, or AI provider keys.

Install dependencies:

```bash
npm ci
```

Validate the Prisma schema and generate the client:

```bash
npm run prisma:validate
npm run prisma:generate
```

For production, apply committed migrations:

```bash
npm run prisma:migrate
```

Then seed **reference data only**:

```bash
npm run db:seed
```

Create the first administrator only when required:

```bash
npm run db:bootstrap-admin
```

The bootstrap command reads the `BOOTSTRAP_*` environment variables. Change the temporary password immediately after first login.

## Development

Run:

```bash
npm run dev
```

Use PostgreSQL in development as well. `prisma db push` is available for disposable development environments only; production deployments should use `prisma migrate deploy`.

## Build and verification

Local checks:

```bash
npm run prisma:validate
npx tsc --noEmit
npm run build
npm run security:audit
```

The **Production Readiness** GitHub Actions workflow additionally verifies:

- PostgreSQL service startup
- Prisma migration deployment and migration status
- reference-only seed integrity
- database connectivity
- zero transactional/demo data immediately after reference seed
- TypeScript
- Next.js production build
- unauthenticated API rejection
- authenticated two-tenant isolation
- cross-tenant mutation rejection
- high-severity production dependency audit

A branch should not be treated as release-ready until the latest workflow run passes.

## Environment variables

See `.env.example`. Important variables include:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — session signing secret
- `PLATFORM_ADMIN_EMAILS` — allowlist for platform-level institution administration
- `ALLOWED_ORIGINS` — optional additional trusted browser origins
- `AI_ALLOW_EXTERNAL` — must be explicitly enabled before external AI calls are allowed
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — optional AI provider configuration
- `BOOTSTRAP_*` — one-time initial administrator creation

## Data integrity and demo-data policy

The repository must not ship transactional “showcase” data that can be mistaken for real assurance evidence. Reference taxonomies such as industries, frameworks, regulations, and process categories are permitted. Business processes, risks, controls, assessment results, test samples, deficiencies, issues, MAPs, monitoring runs, certifications, and management attestations must originate from authenticated user activity, approved integrations, or verified imported source data.

## Deployment notes

Before internet-facing production deployment:

1. Provision a managed PostgreSQL database with encrypted transport, backups, restore testing, and appropriate connection pooling.
2. Store `DATABASE_URL`, `SESSION_SECRET`, bootstrap credentials, and AI keys in the deployment platform's secret manager.
3. Run `prisma migrate deploy` before starting the application.
4. Run `db:seed` only for reference data.
5. Bootstrap the initial administrator, log in, change the temporary password, and remove bootstrap credentials from the environment.
6. Confirm the Production Readiness workflow is green for the exact commit being deployed.
7. Configure HTTPS and ensure production security headers are preserved by the reverse proxy/CDN.

## Repository structure

```text
prisma/
  schema.prisma
  migrations/
  seed.js
scripts/
  bootstrap-admin.mjs
  verify-database.mjs
src/
  app/
    api/
    ...
  components/
  context/
  lib/
.github/
  workflows/
    production-readiness.yml
```

## Security reporting

Do not open a public issue containing credentials, database URLs, tokens, personal data, or exploit payloads against a live deployment. Use the repository owner's private security/contact process for sensitive reports.

## License

ISC License.
