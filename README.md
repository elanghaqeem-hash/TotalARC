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
