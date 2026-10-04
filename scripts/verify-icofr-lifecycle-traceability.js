const assert = (condition, message) => {
  if (!condition) throw new Error('ICOFR_LIFECYCLE_TRACEABILITY_ERROR: ' + message);
};

function byId(items) {
  return new Map((items || []).map(item => [item.id, item]));
}

function validateLifecycle(fixture) {
  const errors = [];
  const financialItems = byId(fixture.financialItems);
  const processes = byId(fixture.processes);
  const assertions = byId(fixture.assertions);
  const risks = byId(fixture.risks);
  const controls = byId(fixture.controls);
  const todTests = byId(fixture.todTests);
  const toeTests = byId(fixture.toeTests);
  const deficiencies = byId(fixture.deficiencies);
  const issues = byId(fixture.issues);
  const maps = byId(fixture.maps);
  const certifications = byId(fixture.certifications);

  for (const assertion of assertions.values()) {
    const financialItem = financialItems.get(assertion.financialItemId);
    if (!financialItem) {
      errors.push('ORPHAN_FINANCIAL_ITEM:' + assertion.id);
      continue;
    }
    if (financialItem.institutionId !== assertion.institutionId) {
      errors.push('CROSS_TENANT_FINANCIAL_ITEM:' + assertion.id);
    }

    const risk = risks.get(assertion.riskId);
    if (!risk) {
      errors.push('MISSING_ASSERTION_RISK:' + assertion.id);
      continue;
    }
    if (risk.institutionId !== assertion.institutionId) {
      errors.push('CROSS_TENANT_ASSERTION_RISK:' + assertion.id);
    }

    const process = processes.get(risk.processId);
    if (!process) {
      errors.push('MISSING_BPM:' + risk.id);
    } else if (process.institutionId !== assertion.institutionId) {
      errors.push('CROSS_TENANT_BPM:' + risk.id);
    }

    const control = controls.get(risk.controlId);
    if (!control) {
      errors.push('MISSING_CONTROL:' + risk.id);
      continue;
    }
    if (control.institutionId !== assertion.institutionId) {
      errors.push('CROSS_TENANT_CONTROL:' + control.id);
    }

    const tod = [...todTests.values()].find(
      item => item.controlId === control.id && item.institutionId === assertion.institutionId
    );
    if (!tod) errors.push('MISSING_TOD:' + control.id);

    const toe = [...toeTests.values()].find(
      item => item.controlId === control.id && item.institutionId === assertion.institutionId
    );
    if (!toe) {
      errors.push('MISSING_TOE:' + control.id);
      continue;
    }

    const relatedDeficiencies = [...deficiencies.values()].filter(
      item => item.toeId === toe.id && item.institutionId === assertion.institutionId
    );
    for (const deficiency of relatedDeficiencies) {
      if (!deficiency.humanApproved) continue;
      const issue = [...issues.values()].find(
        item => item.deficiencyId === deficiency.id && item.institutionId === assertion.institutionId
      );
      if (!issue) {
        errors.push('MISSING_DEFICIENCY_ISSUE:' + deficiency.id);
        continue;
      }
      const map = [...maps.values()].find(
        item => item.issueId === issue.id && item.institutionId === assertion.institutionId
      );
      if (!map) errors.push('MISSING_MAP:' + issue.id);
    }

    const certification = [...certifications.values()].find(
      item =>
        item.institutionId === assertion.institutionId &&
        ['Submitted', 'Approved', 'Signed'].includes(item.status)
    );
    if (!certification) {
      errors.push('MISSING_CERTIFICATION:' + assertion.institutionId);
    }
  }

  return { ok: errors.length === 0, errors };
}

function baseFixture() {
  return {
    financialItems: [{ id: 'fi-1', institutionId: 'tenant-a' }],
    processes: [{ id: 'bp-1', institutionId: 'tenant-a' }],
    assertions: [{
      id: 'as-1',
      institutionId: 'tenant-a',
      financialItemId: 'fi-1',
      riskId: 'risk-1'
    }],
    risks: [{
      id: 'risk-1',
      institutionId: 'tenant-a',
      processId: 'bp-1',
      controlId: 'ctrl-1'
    }],
    controls: [{ id: 'ctrl-1', institutionId: 'tenant-a' }],
    todTests: [{ id: 'tod-1', institutionId: 'tenant-a', controlId: 'ctrl-1' }],
    toeTests: [{ id: 'toe-1', institutionId: 'tenant-a', controlId: 'ctrl-1' }],
    deficiencies: [{
      id: 'def-1',
      institutionId: 'tenant-a',
      toeId: 'toe-1',
      humanApproved: true
    }],
    issues: [{
      id: 'issue-1',
      institutionId: 'tenant-a',
      deficiencyId: 'def-1'
    }],
    maps: [{
      id: 'map-1',
      institutionId: 'tenant-a',
      issueId: 'issue-1'
    }],
    certifications: [{
      id: 'cert-1',
      institutionId: 'tenant-a',
      status: 'Approved'
    }]
  };
}

const orphan = baseFixture();
orphan.assertions[0] = { ...orphan.assertions[0], financialItemId: 'missing-fi' };

const crossTenant = baseFixture();
crossTenant.processes[0] = { ...crossTenant.processes[0], institutionId: 'tenant-b' };

const missingChain = baseFixture();
missingChain.maps = [];

const valid = baseFixture();

const results = {
  orphan: validateLifecycle(orphan),
  crossTenant: validateLifecycle(crossTenant),
  missingChain: validateLifecycle(missingChain),
  validCompleteChain: validateLifecycle(valid)
};

assert(!results.orphan.ok, 'orphan fixture must FAIL');
assert(!results.crossTenant.ok, 'cross-tenant fixture must FAIL');
assert(!results.missingChain.ok, 'missing-chain fixture must FAIL');
assert(results.validCompleteChain.ok, 'valid complete chain must PASS');

console.log('ICOFR lifecycle traceability fixture test PASS');
console.log(JSON.stringify({
  lifecycle: 'Financial Account -> Assertion -> BPM -> Risk -> Control -> ToD -> ToE -> Deficiency -> MAP -> Certification',
  expected: {
    orphan: 'FAIL',
    crossTenant: 'FAIL',
    missingChain: 'FAIL',
    validCompleteChain: 'PASS'
  }
}, null, 2));
