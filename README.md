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
