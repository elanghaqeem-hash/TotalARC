const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/d1-icofr-integrity.ts', 'utf8');
const tableList = source.split('const INTEGRITY_REQUIRED_TABLES = [')[1].split('] as const')[0];
const tables = [...tableList.matchAll(/'([^']+)'/g)].map(match => ({ name: match[1] }));
async function probe(stage) {
  const db = {
    prepare(sql) {
      const run = async () => {
        const current = sql.includes('sqlite_master') ? 'SCHEMA_READ'
          : sql.includes('ORDER BY createdAt') ? 'INSTITUTION_READ'
          : sql.includes('significant_financial AS') ? 'COMPLETENESS_METRICS'
          : sql.includes('AS subCertifications') ? 'CERTIFICATION_METRICS' : 'OTHER';
        if (current === stage) throw new Error('private SQL and database error');
        return current === 'SCHEMA_READ' ? tables : [];
      };
      const statement = { bind: () => statement, all: async () => ({ results: await run() }), first: async () => { await run(); return {}; } };
      return statement;
    },
    batch: async statements => statements.map(() => ({ results: [{ count: 0 }] }))
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console: { error() {} }, require(name) {
      assert.equal(name, '@opennextjs/cloudflare');
      return { getCloudflareContext: async () => ({ env: { DB: db } }) };
    }
  });
  await assert.rejects(exports.getIcofrReferentialIntegrityReport(), error => {
    assert.equal(error.message, 'ICOFR_INTEGRITY_CHECK_FAILED:' + stage);
    assert.ok(!error.message.includes('private SQL'));
    return true;
  });
}
(async () => {
  for (const stage of ['SCHEMA_READ', 'INSTITUTION_READ', 'COMPLETENESS_METRICS', 'CERTIFICATION_METRICS']) await probe(stage);
  console.log('ICOFR error stages PASS: failures remain failures, with stable identifiers and no raw SQL.');
})().catch(error => { console.error(error); process.exitCode = 1; });
