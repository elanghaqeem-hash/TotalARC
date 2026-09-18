# Total ARC (Total Assurance, Risk & Control)

Enterprise Governance, Risk, and Compliance (GRC), Internal Control over Financial Reporting (ICOFR), and Continuous Control Monitoring (CCM) Command Center.

## Overview

**Total ARC** is an enterprise-grade platform built to streamline the end-to-end lifecycle of risk assessment, control testing (Design & Operating Effectiveness), deficiency tracking, root cause analysis, management remediation (MAP), continuous automated monitoring, and executive attestation.

## Key Features

- **Institution & Multi-Entity Management**: Configurable organizational hierarchy, legal entities, directorates, divisions, and role-based views.
- **Business Process Architecture**: Multi-level hierarchical process decomposition, SIPOC mapping, and process criticality.
- **Risk Universe & Assessment**: Inherent vs. residual risk scoring (likelihood x impact), categories, and treatment plans.
- **Control Master Library & RCM**: Comprehensive Risk & Control Matrix mapping preventive, detective, manual, and automated IT controls.
- **Testing Engine (Walkthrough, ToD & ToE)**: Test of Design (ToD) evaluation and Test of Operating Effectiveness (ToE) sampling workflows.
- **Deficiency & Root Cause Analysis**: 5-Whys root cause investigation and deficiency classification (Observation, Control Deficiency, Significant Deficiency, Material Weakness).
- **Remediation & MAP Tracking**: Management Action Plans with milestone progress, independent retesting, and validation workflows.
- **Continuous Control Monitoring (CCM)**: Real-time query logic, automated exceptions detection, and transaction run history.
- **ICOFR & Financial Statement Scoping**: Financial account assertions, significant accounts, and IPE (Information Produced by Entity) registers.
- **Attestation & Certification**: Control Owner certification, sub-certification, and executive sign-off dashboards.
- **AI-Powered Governance Assistant**: Integrated interactive AI analysis drawer for risk, control, and remediation inquiries.

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with Lucide Icons
- **Database & ORM**: [SQLite](https://www.sqlite.org/) with [Prisma ORM](https://www.prisma.io/)
- **UI Components**: Modern responsive design with interactive modals, drawers, and traceability flows

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- `npm` or `yarn`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/elanghaqeem-hash/TotalARC.git
   cd TotalARC
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Database Setup:**
   ```bash
   npm run prisma:generate
   npm run prisma:push
   node prisma/seed.js
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser to explore Total ARC.

## Project Structure

```
├── prisma/
│   ├── schema.prisma       # Database schema definition
│   └── seed.js             # Initial enterprise seed data
├── src/
│   ├── app/
│   │   ├── api/            # API endpoints (dashboard, risks, controls, etc.)
│   │   ├── (modules)/      # Application route pages
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Command Center Dashboard
│   ├── components/         # Reusable UI components & layouts
│   ├── context/            # Role and state management contexts
│   └── lib/                # Utility helpers & Prisma client
└── public/                 # Static assets
```

## License

ISC License


## AI Gateway

Total ARC uses a server-side multi-provider AI Gateway. AI provider keys are never exposed to browser code.

### Routing

- **Cloudflare Workers AI**: default for `confidential` and `restricted` data.
- **Google Gemini**: primary complex reasoning for non-sensitive/sanitized workloads.
- **Groq**: fast chat, classification and lightweight inference.
- **OpenRouter**: last-resort free-model fallback.

The gateway retries transient failures, fails over on quota/provider errors, caps input/output size, redacts common identifiers and secrets before calls to external providers, and records provider metadata without logging prompts or model output.

### Privacy policy

The default is:

```text
AI_DEFAULT_SENSITIVITY=confidential
AI_ALLOW_EXTERNAL_FOR_SENSITIVE=false
AI_REDACT_EXTERNAL=true
```

With this policy, confidential/restricted content is processed only through the Cloudflare Workers AI binding. If that binding is unavailable, Total ARC returns an AI-unavailable response instead of silently sending sensitive data to another provider.

### Cloudflare setup

Workers AI is configured through the `AI` binding in `wrangler.jsonc`. No API key is required for the binding itself.

For Gemini, Groq and OpenRouter, copy `.dev.vars.example` to `.dev.vars` for local development and set the actual secrets there. For production, store the same values as Cloudflare runtime secrets/environment variables; never commit them.

Required/optional values are documented in `.env.example`.

After changing Cloudflare bindings, regenerate types when needed:

```bash
npm run cf-typegen
```

### AI endpoints

- `GET /api/ai/status` — reports configured providers and models without exposing secrets.
- `POST /api/ai/chat` — generic governed Total ARC copilot endpoint.
- `POST /api/ai/analyze` — evidence-based BPM/RCM process and control-gap analysis using registered database context.

AI suggestions remain advisory. They cannot autonomously approve processes, change risk ratings, change ToD/ToE conclusions, close issues, or create/approve remediation.
