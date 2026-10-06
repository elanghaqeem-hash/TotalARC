const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const db = {
  exec: async sql => sqlite.exec(sql),
  prepare(sql) {
    const result = values => ({
      first: async () => sqlite.prepare(sql).get(...values) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => sqlite.prepare(sql).run(...values)
    });
    return { ...result([]), bind: (...values) => result(values) };
  }
};
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, crypto: require('node:crypto').webcrypto, console, require: name => {
    if (imports[name]) return imports[name];
    throw new Error('Unexpected import: ' + name);
  }});
  return exports;
}
const owners = load('src/lib/process-owners.ts');
const core = load('src/lib/d1-core.ts', {
  '@opennextjs/cloudflare': { getCloudflareContext: async () => ({ env: { DB: db } }) },
  '@/lib/institution-context': { resolveServerActiveInstitutionId: async () => 'bank-a' },
  '@/lib/process-owners': owners
});
function seed(table, values) {
  for (const column of sqlite.prepare('PRAGMA table_info(' + table + ')').all()) {
    if (column.notnull && column.dflt_value == null && values[column.name] === undefined) values[column.name] = /INT/.test(column.type) ? 0 : 'fixture-' + values.id;
  }
  const keys = Object.keys(values);
  sqlite.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values));
}
(async () => {
  await core.ensureCoreDomainSchema();
  seed('Institution', { id: 'bank-a' });
  seed('Institution', { id: 'bank-b' });
  sqlite.exec('CREATE TABLE IF NOT EXISTS OrganizationUnit (id TEXT PRIMARY KEY, institutionId TEXT, code TEXT, name TEXT, type TEXT, parentId TEXT, status TEXT)');
  for (const [id, institutionId, status] of [['a1','bank-a','Active'],['a2','bank-a','Active'],['b1','bank-b','Active'],['inactive','bank-a','Inactive']]) seed('OrganizationUnit', { id, institutionId, code:id, name:'Unit '+id, type:'Division', status });
  // Exercise additive migration on a pre-feature database.
  sqlite.exec('ALTER TABLE BusinessProcess DROP COLUMN ownerOrgUnitIds');
  const input = { name:'Proses', categoryId:'ref:CAT-CORE', criticality:'High', classification:'Core', ownerOrgUnitIds:['a1','a2','a1'], ownerName:'spoofed label' };
  const created = await core.createBusinessProcess(input, 'bank-a');
  assert.equal(created.ownerName, 'Unit a1; Unit a2');
  assert.deepEqual(Array.from(created.ownerOrgUnitIds), ['a1','a2']);
  const reloaded = await core.getBusinessProcessDetail(created.id,'bank-a');
  assert.deepEqual(Array.from(reloaded.ownerOrgUnitIds), ['a1','a2']);
  for (const invalid of [['b1'], ['inactive'], ['missing']]) await assert.rejects(core.updateBusinessProcess(created.id,{...input, ownerOrgUnitIds:invalid},'bank-a'), /PROCESS_OWNER_UNIT_NOT_FOUND/);
  await assert.rejects(core.updateBusinessProcess(created.id,input,'bank-b'), /PROCESS_NOT_FOUND/);
  assert.equal((await core.getBusinessProcessDetail(created.id,'bank-a')).ownerName, 'Unit a1; Unit a2');
  const unchanged = await core.updateBusinessProcess(created.id,{ name:'Updated', ownerName:'spoofed' },'bank-a');
  assert.equal(unchanged.ownerName,'Unit a1; Unit a2');
  const cleared = await core.updateBusinessProcess(created.id,{ownerOrgUnitIds:[]},'bank-a');
  assert.equal(cleared.ownerName,'');
  assert.equal(cleared.ownerOrgUnitIds.length,0);
  const legacy = await core.createBusinessProcess({...input, ownerOrgUnitIds:undefined, ownerName:'Legacy owner'},'bank-a');
  assert.equal((await core.updateBusinessProcess(legacy.id,{name:'Updated'},'bank-a')).ownerName,'Legacy owner');
  assert.equal((await core.listProcessOwnerUnits('bank-a')).length,2);
  console.log('Process owners PASS: migration, multi-owner save/reload, tenant isolation, inactive rejection, clear selection, legacy preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
