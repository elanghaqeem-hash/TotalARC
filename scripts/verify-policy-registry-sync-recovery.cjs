/* Policy Registry regression: fast schema reads, safe single-flight sync. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = process.cwd();
const file = 'src/lib/d1-policy-registry.ts';
const filename = path.join(root, file);
const source = fs.readFileSync(filename, 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/app/policy-library/page.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/app/api/policy-library/route.ts'), 'utf8');

assert.match(source, /POLICY_REGISTRY_ACTIVE_WINDOW_MS/);
assert.match(source, /status='INTERRUPTED'/);
assert.match(source, /INSERT INTO PolicyRegistrySyncRun/);
assert.match(source, /WHERE NOT EXISTS \(/);
assert.match(source, /POLICY_REGISTRY_SYNC_IN_PROGRESS/);
assert.match(source, /staleSync: isStaleRegistrySync\(lastSync\)/);
assert.match(ui, /registry\?\.staleSync/);
assert.match(api, /POLICY_REGISTRY_SYNC_IN_PROGRESS.*409/);

const requiredObjects = [
  'PolicyRegistrySource', 'idx_policy_registry_source_unique',
  'idx_policy_registry_source_policy', 'PolicyEntityLink',
  'idx_policy_entity_link_unique', 'idx_policy_entity_link_policy',
  'idx_policy_entity_link_target', 'PolicyDocumentCluster',
  'idx_policy_document_cluster_unique', 'idx_policy_document_cluster_group',
  'idx_policy_document_cluster_policy', 'PolicyRegistrySyncRun',
  'idx_policy_registry_sync_run'
];
const sqlCalls = [];
const db = {
  prepare(sql) {
    const record = { sql, params: [] };
    sqlCalls.push(record);
    const stmt = {
      bind(...params) { record.params = params; return stmt; },
      async all() {
        if (sql.includes('sqlite_master')) return { results: requiredObjects.map(name => ({ name })) };
        if (sql.includes('PRAGMA table_info(PolicyRegistrySyncRun)')) {
          return { results: [{ name: 'id' }, { name: 'syncVersion' }] };
        }
        throw new Error('Unexpected all(): ' + sql.slice(0, 100));
      },
      async run() { return { success: true }; },
      async first() {
        if (sql.includes('SELECT id FROM PolicyRegistrySyncRun WHERE id=')) return null;
        throw new Error('Unexpected first(): ' + sql.slice(0, 100));
      }
    };
    return stmt;
  }
};
const dependencies = {
  '@opennextjs/cloudflare': { getCloudflareContext: async () => ({ env: { DB: db } }) },
};
for (const p of [
  ['@/lib/d1-core', 'ensureCoreDomainSchema'],
  ['@/lib/d1-source-library', 'ensureSourceLibrarySchema'],
  ['@/lib/d1-evidence-repository', 'ensureEvidenceRepositorySchema'],
  ['@/lib/d1-policy-library', 'ensurePolicyLibrarySchema'],
  ['@/lib/d1-regulatory-obligations', 'ensureRegulatoryObligationSchema'],
  ['@/lib/d1-rcsa', 'ensureRcsaSchema'],
  ['@/lib/d1-assurance', 'ensureAssuranceSchema'],
  ['@/lib/d1-policy-intelligence', 'ensurePolicyIntelligenceSchema']
]) dependencies[p[0]] = { [p[1]]: async () => null };

const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const baseRequire = mod.require.bind(mod);
mod.require = requested => Object.hasOwn(dependencies, requested)
  ? dependencies[requested] : baseRequire(requested);
mod._compile(ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  },
  fileName: filename
}).outputText, filename);

(async () => {
  await mod.exports.ensurePolicyRegistrySchema();
  assert.equal(sqlCalls.filter(row => /^\s*(CREATE|ALTER)\s/i.test(row.sql)).length, 0,
    'Healthy schema must not incur CREATE/ALTER DDL on cold reads');
  assert.equal(sqlCalls.filter(row => row.sql.includes('sqlite_master')).length, 1);
  await assert.rejects(
    () => mod.exports.syncPolicyRegistryFromDatabase('tenant-1', 'test-reviewer'),
    /POLICY_REGISTRY_SYNC_IN_PROGRESS/
  );
  assert.ok(sqlCalls.some(row => row.sql.includes("status='INTERRUPTED'") &&
    row.params.includes('tenant-1')), 'stale rows should only be reclaimed for selected tenant');
  assert.ok(sqlCalls.some(row => row.sql.includes('INSERT INTO PolicyRegistrySyncRun') &&
    row.sql.includes('WHERE NOT EXISTS') && row.params.includes('tenant-1')),
    'simultaneous sync insert must have database-backed single-flight guard');
  console.log('POLICY_REGISTRY_RECOVERY: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
