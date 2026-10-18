# ICOFR test approval and production completeness

ToD creation and final approval use separate paths. The traceability form saves Draft/Under Review only; its tester is the authenticated user. `Approved` requests to this legacy endpoint return 409 and direct the user to Workpaper Review. Non-string status/conclusion values are rejected before authorization or persistence.

## Operating flow

1. The tester saves the ToD, or creates an assigned ToE from the testing workflow. The same authenticated tester creates its Workpaper Review. This binds the workpaper to a user ID; a client-supplied name cannot transfer ownership.
2. Upload evidence through the Evidence Repository. Link each accepted index item as `WORKPAPER_EVIDENCE` (the repository's synchronized index option creates this link). A free-text reference alone is insufficient.
3. A different user with role `Reviewer` reviews evidence and the workpaper. The reviewer name and role come from the session. Approval requires the existing quality checklist, a substantive review note, actual current evidence bytes whose SHA-256 matches, and an assessed conclusion. An Effective ToD additionally requires all five design criteria.
4. ToE requires a documented population and sampling method, actual completed samples with evidence references, consistent counts, and persisted exceptions for failed samples. Conclusions must reflect the actual results; approval does not require falsely recording Effective.
5. The server captures the approved test contents and sample contents, signer IDs and evidence versions. Later edits, replaced evidence, pending review notes or incomplete writes invalidate eligibility. ToD and ToE must have the same period to close a chain.

The production verifier also requires a published PLC mapping with current source hash, four distinct mapping signers and the current source-scoped account/BPM/risk/control graph. ITGC cannot replace this PLC requirement.

## Existing records

Legacy Approved labels are not automatically converted into authenticated approval proofs. They remain ineligible until the authorized tester/reviewer performs the governed workflow on the appropriate workpaper. If an old record is locked, follow the existing period reopening/correction process and create a corrected workpaper; do not update signer IDs or evidence fields directly in D1 to obtain PASS.

No assertions, PLCs, human approvals, ToD results or ToE samples are populated by this change. The 37-account source completeness issue remains a bank validation task. An empty assertion population does not imply zero business gaps.

## Schema and deployment

`scripts/prepare-icofr-test-governance-schema.cjs <output.sql>` generates additive table/index/view DDL from the runtime sources. It does not connect to D1. The existing Cloudflare deployment workflow applies this DDL to the already pinned production binding before deploying the Worker. It does not update bank business data or backfill approval proofs.

Integrity verification remains read-only. Missing schema produces a schema diagnostic/503; incomplete business data produces 409. Neither response may be presented as PASS. Successful local tests or builds are separate from deployment and production acceptance.

## Validation

- `npm run verify:icofr-test-approval` executes route rejection cases, the real approval service and the real production SQL against isolated SQLite fixtures. It covers session IDs, separation of duties, current evidence and hashes, stale snapshots, actual samples, period mismatch, current published PLC mappings, valid/incomplete chains, and repeatable additive schema.
- Existing source mapping, maker-checker, bounded integrity-query, tenant/auth/security and RCM checks remain required.
- Required Checks runs the new test. The dependency-free RCM contract job runs without an unnecessary Prisma installation; its RCM assertions are unchanged.
