/* Regression: a deployment health token must never authorize tenant APIs. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = process.cwd();
const relative = 'src/middleware.ts';
const filename = path.join(root, relative);
const source = fs.readFileSync(filename, 'utf8');
assert.match(source, /READ_ONLY_HEALTH_PROBES/);
assert.doesNotMatch(source, /pathname\.startsWith\('\/api\/'\).*return false/); // guard against reverting to a blanket prefix check

const token = 'totalarc-fixture-health-token-for-test-only';
const previous = {
  TOTAL_ARC_HEALTHCHECK_TOKEN: process.env.TOTAL_ARC_HEALTHCHECK_TOKEN,
  TOTAL_ARC_AUTH_SECRET: process.env.TOTAL_ARC_AUTH_SECRET
};
process.env.TOTAL_ARC_HEALTHCHECK_TOKEN = token;
process.env.TOTAL_ARC_AUTH_SECRET = 'fixture-auth-key-not-for-production';

class MockResponse {
  constructor(status, body = null) {
    this.status = status;
    this.body = body;
    this.cookies = { set() {} };
  }
  static next() { return new MockResponse(200); }
  static json(body, options = {}) { return new MockResponse(options.status || 200, body); }
  static redirect() { return new MockResponse(307); }
}

const mocks = {
  'next/server': { NextResponse: MockResponse },
  '@opennextjs/cloudflare': { getCloudflareContext: async () => ({ env: {} }) },
  '@/lib/access-control': {
    canAccessApi: () => false,
    canAccessPage: () => false,
    isUserRole: () => false
  },
  '@/lib/auth-token': {
    AUTH_COOKIE_NAME: 'total_arc_auth',
    isAuthSecretUsable: () => true,
    verifySessionToken: async () => null
  },
  '@/lib/auth-security': { isAuthSessionActive: async () => false },
  '@/lib/auth-mfa': { isMfaRequiredForRole: () => false }
};
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  },
  fileName: filename
}).outputText;

const imported = new Module(filename, module);
imported.filename = filename;
imported.paths = Module._nodeModulePaths(path.dirname(filename));
const requireBase = imported.require.bind(imported);
imported.require = request =>
  Object.prototype.hasOwnProperty.call(mocks, request)
    ? mocks[request] : requireBase(request);
imported._compile(compiled, filename);

async function check(method, route, expected, supplied = token) {
  const url = 'https://example.invalid' + route;
  const request = {
    method,
    url,
    nextUrl: new URL(url),
    headers: new Headers({ 'x-total-arc-health-token': supplied }),
    cookies: { get: () => undefined }
  };
  const response = await imported.exports.middleware(request);
  assert.equal(response.status, expected, method + ' ' + route);
}

(async () => {
  for (const route of [
    '/api/system/database',
    '/api/system/rcm-integrity',
    '/api/system/icofr-integrity'
  ]) {
    await check('GET', route, 200);
    await check('HEAD', route, 200);
    await check('GET', route, 401, 'incorrect-health-token');
  }
  await check('POST', '/api/auth/bootstrap', 200);
  await check('POST', '/api/system/source-migration', 200);
  for (const route of [
    '/api/onboarding',
    '/api/organization',
    '/api/processes',
    '/api/risks',
    '/api/controls',
    '/api/dashboard',
    '/api/rcm',
    '/api/icofr/hub',
    '/api/assurance',
    '/api/policy-library',
    '/api/admin/users',
    '/api/system/source-migration',
    '/api/system/database-extra',
    '/api/system/rcm-integrity/extra'
  ]) {
    await check('GET', route, 401);
  }
  await check('POST', '/api/system/database', 401);
  await check('POST', '/api/policy-library', 401);
  console.log('HEALTH_PROBE_SCOPE: PASS (read-only allowlist, guarded POST, and denied tenant GET/POST).');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
