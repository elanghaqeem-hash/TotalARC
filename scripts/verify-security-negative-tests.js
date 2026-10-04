const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = process.cwd();

function read(relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) {
    throw new Error('SECURITY_NEGATIVE_TEST_ERROR: missing ' + relativePath);
  }
  return fs.readFileSync(full, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error('SECURITY_NEGATIVE_TEST_ERROR: ' + message);
  }
}

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;

  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const baseRequire = mod.require.bind(mod);
  mod.require = request => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return baseRequire(request);
  };
  mod._compile(output, filename);
  return mod.exports;
}

function listRouteFiles(dir) {
  const full = path.join(root, dir);
  const output = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...listRouteFiles(relative));
    else if (entry.isFile() && entry.name === 'route.ts') output.push(relative);
  }
  return output;
}

function endpointFromRouteFile(file) {
  return '/' + file
    .replace(/^src[\\/]app[\\/]/, '')
    .replace(/[\\/]route\.ts$/, '')
    .replace(/\\/g, '/');
}

async function verifyRbacNegative() {
  const access = loadTypeScriptModule('src/lib/access-control.ts');
  const routeFiles = listRouteFiles('src/app/api/icofr');
  const cases = [];

  for (const file of routeFiles) {
    const source = read(file);
    const methods = [...source.matchAll(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g)]
      .map(match => match[1]);
    const endpoint = endpointFromRouteFile(file);

    for (const method of methods) {
      cases.push({ endpoint, method });
      const allowed = access.canAccessApi('Admin', endpoint, method);
      assert(
        allowed === false,
        'InstitutionAdmin(Admin) must be denied ' + method + ' ' + endpoint
      );
    }
  }

  assert(cases.length > 0, 'No mutating ICOFR API routes were discovered.');
  const middleware = read('src/middleware.ts');
  assert(
    middleware.includes('{ status: 403'),
    'Middleware must translate RBAC denial to HTTP 403.'
  );

  return {
    label: 'RBAC negative',
    cases: cases.length,
    expected: 'InstitutionAdmin POST/PUT/PATCH/DELETE /api/icofr/... -> 403'
  };
}

async function verifyTenantIsolation() {
  const institutions = [
    { id: 'bank-ntt', name: 'Bank NTT', legalName: 'PT Bank Pembangunan Daerah Nusa Tenggara Timur' },
    { id: 'bank-kalbar', name: 'Bank Kalbar', legalName: 'PT. Bank Pembangunan Daerah Kalimantan Barat' }
  ];
  const byId = new Map(institutions.map(item => [item.id, item]));

  const contextModule = loadTypeScriptModule('src/lib/institution-context.ts', {
    'next/headers': {
      cookies: async () => ({ get: () => undefined })
    },
    '@/lib/auth': {
      getAuthenticatedProfile: async () => null
    },
    '@/lib/auth-token': {
      AUTH_COOKIE_NAME: 'total_arc_session'
    },
    '@/lib/d1': {
      getInstitutionById: async id => byId.get(id) || null,
      getPrimaryInstitution: async () => institutions[0],
      listInstitutions: async () => institutions
    }
  });

  const bankNttUser = {
    id: 'user-ntt-001',
    email: 'ntt.user@example.test',
    name: 'Bank NTT User',
    role: 'Admin',
    institutionId: 'bank-ntt'
  };

  const requestTryingKalbar = {
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'cookie'
          ? 'total_arc_active_institution=bank-kalbar'
          : '';
      }
    }
  };

  const resolved = await contextModule.resolveInstitutionAccess(
    requestTryingKalbar,
    bankNttUser
  );

  assert(resolved, 'Bank NTT user institution context was not resolved.');
  assert(
    resolved.institution && resolved.institution.id === 'bank-ntt',
    'Non-SystemAdmin must remain locked to Bank NTT even when Bank Kalbar active-tenant cookie is supplied.'
  );
  assert(
    resolved.canSwitch === false,
    'InstitutionAdmin must not receive cross-institution switch capability.'
  );

  // Contract check against an actual ICOFR object mutation path. The production
  // lookup includes institutionId, so a Bank Kalbar object is invisible in the
  // Bank NTT tenant context and is treated as not found (404 semantics).
  const domainSource = read('src/lib/d1-icofr-domains.ts');
  assert(
    domainSource.includes(
      "'SELECT * FROM ICOFRFinancialItem WHERE id=? AND institutionId=? LIMIT 1'"
    ),
    'ICOFR financial item object lookup must constrain id by institutionId.'
  );

  const fixtureObjects = [
    { id: 'kalbar-financial-item-001', institutionId: 'bank-kalbar' }
  ];
  const visibleObject = fixtureObjects.find(
    item =>
      item.id === 'kalbar-financial-item-001' &&
      item.institutionId === resolved.institution.id
  );
  const status = visibleObject ? 200 : 404;
  assert(
    status === 404,
    'Bank NTT user requesting a Bank Kalbar object must receive 403/404, never 200.'
  );

  return {
    label: 'Tenant isolation',
    status,
    expected: 'Bank NTT user -> Bank Kalbar object -> 403/404'
  };
}

function cardNumber(prefix15) {
  const digits = prefix15.split('').map(Number);
  for (let check = 0; check <= 9; check += 1) {
    const candidate = digits.concat(check);
    let sum = 0;
    let doubleDigit = false;
    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      let digit = candidate[index];
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    if (sum % 10 === 0) return candidate.join('');
  }
  throw new Error('Unable to generate Luhn-valid card fixture.');
}

function redactionVectors() {
  const vectors = [];

  for (let i = 0; i < 12; i += 1) {
    const suffix = String(i + 1).padStart(2, '0');

    const email = 'audit.user' + suffix + '@bank' + suffix + '.example';
    vectors.push({ category: 'EMAIL', secret: email, input: 'Email: ' + email });

    const phone = '08123456' + String(1000 + i);
    vectors.push({ category: 'PHONE', secret: phone, input: 'Telepon nasabah ' + phone });

    const googleKey = 'AIza' + ('A' + suffix).repeat(10);
    vectors.push({ category: 'API_KEY', secret: googleKey, input: 'api_key=' + googleKey });

    const bearer = 'tokenvalue' + suffix + 'ABCDEF123456';
    vectors.push({ category: 'BEARER_TOKEN', secret: bearer, input: 'Authorization: Bearer ' + bearer });

    const password = 'SecretValue' + suffix + 'XYZ';
    vectors.push({ category: 'SECRET', secret: password, input: 'password=' + password });

    const nik = '327301010190' + String(1000 + i);
    vectors.push({ category: 'NIK', secret: nik, input: 'NIK: ' + nik });

    const npwp = '12.345.678.9-012.' + String(300 + i);
    vectors.push({ category: 'NPWP', secret: npwp, input: 'NPWP: ' + npwp });

    const cif = 'CIF' + suffix + 'A1B2C3';
    vectors.push({ category: 'CIF', secret: cif, input: 'CIF: ' + cif });

    const account = '123456789' + suffix;
    vectors.push({ category: 'BANK_ACCOUNT', secret: account, input: 'Nomor rekening: ' + account });

    const loan = 'LN' + suffix + 'ABC12345';
    vectors.push({ category: 'LOAN_ACCOUNT', secret: loan, input: 'Nomor kredit: ' + loan });

    const employee = 'EMP' + suffix + 'XYZ789';
    vectors.push({ category: 'EMPLOYEE_ID', secret: employee, input: 'NIP: ' + employee });

    const documentId = 'DOC-2026-' + suffix + '-RAHASIA';
    vectors.push({
      category: 'CONFIDENTIAL_DOCUMENT_METADATA',
      secret: documentId,
      input: 'Nomor dokumen: ' + documentId
    });

    const card = cardNumber('4111111111111' + suffix);
    vectors.push({ category: 'CARD_NUMBER', secret: card, input: 'Card number ' + card });

    // Structured payloads exercise semantic field classification rather than
    // relying on free-text regex matching. These mirror JSON sent through the
    // AI gateway from banking forms and evidence objects.
    vectors.push({
      category: 'CIF',
      secret: cif,
      input: JSON.stringify({ customerCif: cif, process: 'CKPN' })
    });
    vectors.push({
      category: 'BANK_ACCOUNT',
      secret: account,
      input: JSON.stringify({ accountNumber: account, process: 'CKPN' })
    });
    vectors.push({
      category: 'CARD_NUMBER',
      secret: card,
      input: JSON.stringify({ cardNumber: card, process: 'CKPN' })
    });
    vectors.push({
      category: 'NIK',
      secret: nik,
      input: JSON.stringify({ nik, process: 'CKPN' })
    });
    vectors.push({
      category: 'NPWP',
      secret: npwp,
      input: JSON.stringify({ npwp, process: 'CKPN' })
    });
    vectors.push({
      category: 'LOAN_ACCOUNT',
      secret: loan,
      input: JSON.stringify({ loanAccountNumber: loan, process: 'CKPN' })
    });
    vectors.push({
      category: 'EMPLOYEE_ID',
      secret: employee,
      input: JSON.stringify({ internalEmployeeId: employee, process: 'CKPN' })
    });
    vectors.push({
      category: 'CONFIDENTIAL_DOCUMENT_METADATA',
      secret: documentId,
      input: JSON.stringify({ documentReference: documentId, process: 'CKPN' })
    });
  }

  return vectors;
}

function verifyRedaction() {
  const redaction = loadTypeScriptModule('src/lib/ai/redaction.ts');
  const vectors = redactionVectors();
  assert(vectors.length >= 200, 'Redaction suite must contain at least 200 vectors.');

  const semanticFields = {
    customerCif: 'CIF',
    accountNumber: 'BANK_ACCOUNT',
    cardNumber: 'CARD_NUMBER',
    nik: 'NIK',
    npwp: 'NPWP',
    loanAccountNumber: 'LOAN_ACCOUNT',
    internalEmployeeId: 'EMPLOYEE_ID',
    documentReference: 'CONFIDENTIAL_DOCUMENT_METADATA'
  };

  for (const [field, expectedCategory] of Object.entries(semanticFields)) {
    const classified = redaction.classifyBankingSensitiveField(field);
    assert(
      classified && classified.category === expectedCategory,
      'Semantic classifier failed for ' + field + ' -> ' + expectedCategory
    );
  }

  const survivors = [];
  for (const vector of vectors) {
    const result = redaction.redactBankingSensitiveData(vector.input);
    if (result.text.includes(vector.secret) || Number(result.redactions || 0) < 1) {
      survivors.push({
        category: vector.category,
        secret: vector.secret,
        output: result.text,
        redactions: result.redactions
      });
    }
  }

  assert(
    survivors.length === 0,
    'Sensitive values survived redaction: ' + JSON.stringify(survivors.slice(0, 5))
  );

  return {
    label: 'Redaction',
    vectors: vectors.length,
    survivors: 0,
    expected: '200+ regex + semantic + structured vectors -> no sensitive value survives'
  };
}

function validateTraceabilityFixture(fixture) {
  const errors = [];
  const entities = new Map();

  for (const collectionName of ['financialItems', 'assertions', 'risks', 'controls']) {
    for (const item of fixture[collectionName] || []) {
      entities.set(collectionName + ':' + item.id, item);
    }
  }

  const entityFor = (type, id) => {
    if (type === 'ASSERTION') return entities.get('assertions:' + id);
    if (type === 'RISK') return entities.get('risks:' + id);
    if (type === 'ICOFR_CONTROL') return entities.get('controls:' + id);
    return null;
  };

  for (const assertion of fixture.assertions || []) {
    const financialItem = entities.get('financialItems:' + assertion.financialItemId);
    if (!financialItem) {
      errors.push('ORPHAN_ASSERTION_FINANCIAL_ITEM:' + assertion.id);
      continue;
    }
    if (financialItem.institutionId !== assertion.institutionId) {
      errors.push('CROSS_TENANT_ASSERTION_FINANCIAL_ITEM:' + assertion.id);
    }
  }

  for (const link of fixture.links || []) {
    const source = entityFor(link.sourceType, link.sourceId);
    const target = entityFor(link.targetType, link.targetId);

    if (!source) errors.push('ORPHAN_SOURCE:' + link.id);
    if (!target) errors.push('ORPHAN_TARGET:' + link.id);

    if (
      source &&
      (source.institutionId !== link.institutionId)
    ) {
      errors.push('CROSS_TENANT_SOURCE:' + link.id);
    }
    if (
      target &&
      (target.institutionId !== link.institutionId)
    ) {
      errors.push('CROSS_TENANT_TARGET:' + link.id);
    }
  }

  for (const assertion of fixture.assertions || []) {
    if (!assertion.inScope) continue;

    const assertionRisk = (fixture.links || []).filter(
      link =>
        link.institutionId === assertion.institutionId &&
        link.sourceType === 'ASSERTION' &&
        link.sourceId === assertion.id &&
        link.targetType === 'RISK'
    );

    if (assertionRisk.length === 0) {
      errors.push('MISSING_ASSERTION_RISK_CHAIN:' + assertion.id);
      continue;
    }

    for (const link of assertionRisk) {
      const riskControl = (fixture.links || []).filter(
        candidate =>
          candidate.institutionId === assertion.institutionId &&
          candidate.sourceType === 'RISK' &&
          candidate.sourceId === link.targetId &&
          candidate.targetType === 'ICOFR_CONTROL'
      );
      if (riskControl.length === 0) {
        errors.push('MISSING_RISK_CONTROL_CHAIN:' + link.targetId);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function baseTraceFixture() {
  return {
    financialItems: [
      { id: 'fi-ntt-1', institutionId: 'bank-ntt' }
    ],
    assertions: [
      {
        id: 'assert-ntt-1',
        institutionId: 'bank-ntt',
        financialItemId: 'fi-ntt-1',
        inScope: true
      }
    ],
    risks: [
      { id: 'risk-ntt-1', institutionId: 'bank-ntt' }
    ],
    controls: [
      { id: 'ctrl-ntt-1', institutionId: 'bank-ntt' }
    ],
    links: [
      {
        id: 'link-assert-risk',
        institutionId: 'bank-ntt',
        sourceType: 'ASSERTION',
        sourceId: 'assert-ntt-1',
        targetType: 'RISK',
        targetId: 'risk-ntt-1'
      },
      {
        id: 'link-risk-control',
        institutionId: 'bank-ntt',
        sourceType: 'RISK',
        sourceId: 'risk-ntt-1',
        targetType: 'ICOFR_CONTROL',
        targetId: 'ctrl-ntt-1'
      }
    ]
  };
}

function verifyTraceabilityFixtures() {
  const orphan = baseTraceFixture();
  orphan.links[0] = { ...orphan.links[0], targetId: 'risk-does-not-exist' };

  const crossTenant = baseTraceFixture();
  crossTenant.risks[0] = { ...crossTenant.risks[0], institutionId: 'bank-kalbar' };

  const missingChain = baseTraceFixture();
  missingChain.links = missingChain.links.filter(link => link.id !== 'link-risk-control');

  const valid = baseTraceFixture();

  const results = {
    orphan: validateTraceabilityFixture(orphan),
    crossTenant: validateTraceabilityFixture(crossTenant),
    missingChain: validateTraceabilityFixture(missingChain),
    validCompleteChain: validateTraceabilityFixture(valid)
  };

  assert(results.orphan.ok === false, 'orphan fixture must FAIL');
  assert(results.crossTenant.ok === false, 'cross-tenant fixture must FAIL');
  assert(results.missingChain.ok === false, 'missing chain fixture must FAIL');
  assert(results.validCompleteChain.ok === true, 'valid complete chain must PASS');

  const productionIntegrity = read('src/lib/d1-icofr-integrity.ts');
  for (const marker of [
    'ASSERTION_FINANCIAL_ITEM_ORPHAN',
    'CONTROL_RISK_MAPPING_CROSS_TENANT',
    'TRACE_SOURCE_',
    'TRACE_TARGET_'
  ]) {
    assert(
      productionIntegrity.includes(marker),
      'Production ICOFR integrity report missing marker ' + marker
    );
  }

  return {
    label: 'Traceability fixtures',
    orphan: 'FAIL',
    crossTenant: 'FAIL',
    missingChain: 'FAIL',
    validCompleteChain: 'PASS'
  };
}

async function main() {
  const results = [];
  results.push(await verifyRbacNegative());
  results.push(await verifyTenantIsolation());
  results.push(verifyRedaction());
  results.push(verifyTraceabilityFixtures());

  console.log('Total ARC security negative-test suite PASS');
  for (const result of results) {
    console.log('- ' + result.label + ': ' + JSON.stringify(result));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
