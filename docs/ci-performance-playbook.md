# Total ARC — delivery performance playbook

## Faster diagnosis with existing artifacts

1. Begin from the last failed GitHub Actions job and the relevant source artifact, rather than repeating the entire repository audit.
2. Run targeted, dependency-free checks with `npm run verify:focused -- --files src/lib/d1-compliance-risk-assessment.ts`; or compare to main with `npm run verify:focused -- --base origin/main`.
3. The focused verifier only selects existing source-level contract tests relevant to the changed module. It does **not** replace the Required Checks, Build, TypeScript, Tenant Isolation, RBAC, or Production Gate.
4. Keep PRs limited to the domain being fixed. Run the full Merge Gate once the changed modules pass focused verification.
5. Treat production D1 and authenticated business UAT as separate verification layers; a successful Worker deployment does not mean global RCM/ICOFR integrity is PASS.

## D1 CRA optimization

The CRA paginated list is ordered by `updatedAt` and optionally filtered by `period`. Added two additive indexes:
- `(institutionId, updatedAt DESC)`
- `(institutionId, period, updatedAt DESC)`

The existing `verify-cra-production.cjs` creates and confirms these indexes as part of its production readiness check. Indexing does not remove, mutate, or approve any bank assessment.

## CI installation efficiency — remaining recommendation

A number of static source-level GitHub Actions jobs invoke `npm ci` although their scripts read source files through Node built-ins. Avoid removing or skipping their tests: only consider eliminating the *redundant dependency install* in a separately reviewed CI change after measuring timings. Existing mandatory job list remains unchanged in this PR.

## Known independent production blockers

- Actual RCM 133 versus acceptance baseline 132: source-by-source reconciliation required.
- ICOFR `COMPLETENESS_METRICS` check failed: diagnose its queries and dependencies; do not change expected values or delete source data just to make the gate green.

Compare the previous and next comparable GitHub Actions run duration before reporting any measured improvement.
