# TotalARC — Compliance Management Priority 1 Delivery Plan

Status: implemented in phases; the presence of a plan item below does not imply it is deployed.

## Scope and delivery order

1. **Compliance Dashboard 360** — D1-backed tenant-scoped overview of active regulatory obligations, stored compliance assessments, owner coverage, cross-module links, overdue assessment actions, priority queue and existing Policy/Regulatory Watch totals. **Implemented in stage 1.**
2. **Compliance Monitoring Plan** — annual/quarterly plan master, risk-based scheduling, PIC from organization hierarchy, scope links to obligations and BPM, approval history, actual vs planned, unit/cabang filters.
3. **Compliance Risk Assessment** — risk score and rationale at obligation/product/process/unit level, inherent vs residual, control linkage to RCM, periodic re-assessment, independent validation.
4. **Compliance Testing & Review** — workprogram, sample/population, ToD/ToE references, evidence, findings, reviewer sign-off, re-test and MAP integration. Do not conflate an untested control with a passed control.
5. **Regulatory Reporting Control Room** — regulator and obligation-specific filing calendar, due dates, approver, submission receipt, bank cut-offs, amendment/revision history and overdue escalation.
6. **Regulatory Finding & Commitment Tracker** — regulator correspondence, finding, required commitment, management action owner, due date, evidence, validation and closure. Reuse existing Remediation/MAP when the record can be linked without losing source provenance.

## Cross-cutting acceptance controls

- **Scope**: all operational read and write endpoints resolve institution from authenticated server session; never from client-provided institutionId.
- **RBAC**: SystemAdmin/Admin/ComplianceOfficer may manage according to least privilege and maker-checker rules; RiskManager/InternalAuditor/Executive/ReadOnlyAuditor may read the authorized dashboard but cannot mutate compliance records. Operational users see only permitted units when unit-level scoping is added.
- **SoD**: owner cannot self-approve risk/testing outcomes; approval creates an immutable audit event.
- **No synthetic banking facts**: empty data must display as missing/unassessed, not green or 100% compliant. AI output is draft only.
- **Traceability**: regulation → obligation → policy/SOP → process → risk → control → evidence → assessment → finding/MAP. Inferred links require review, never silently accepted.
- **Performance**: aggregate and indexed queries by institution, paginated operational tables, deferred/detail loading on mobile; avoid auto-running expensive cross-module discovery.
- **Quality**: typecheck, tenant negative tests, no-dummy tests, build Cloudflare/Vercel and authenticated production smoke tests before acceptance.

## Stage 1 measurement definition

The Compliance Dashboard uses existing **RegulatoryObligation** records. Only records with `status=Active` form the compliance denominator. `NOT_APPLICABLE` is excluded. `NOT_ASSESSED` remains in the denominator, reducing (not inflating) the reported percentage. Records with no active obligations have a null rate, never a perfect score.

The mapping percentage reports obligations with **at least one explicit link** in `RegulatoryObligationLink`, not a complete five-hop traceability chain. The dashboard's latest remediation actions are derived from the newest persisted `RegulatoryObligationAssessment` per obligation; these are not copies of regulator examination findings.

Monitoring plans, specific regulatory submission receipts, compliance testing and regulator findings cannot be marked complete until stages 2–6 establish their own persisted lifecycle.

### Navigation

- `/compliance` — Compliance Dashboard 360 (Stage 1)
- `/api/compliance/dashboard` — authorized GET-only D1 projection
- `/policy-library?tab=obligations` — existing Compliance Universe editor
