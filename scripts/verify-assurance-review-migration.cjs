'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const assurance=read('src/lib/d1-assurance.ts');
const deploy=read('.github/workflows/deploy-cloudflare.yml');
const script=read('scripts/migrate-assurance-review-columns.py');
const integrity=read('src/lib/d1-icofr-integrity.ts');
const markers=[
  [assurance,'ensureAssuranceReviewColumns(db)'],
  [assurance,'PRAGMA table_info(ControlDeficiency)'],
  [assurance,'ALTER TABLE ControlDeficiency ADD COLUMN'],
  [assurance,"'humanApproved', 'INTEGER NOT NULL DEFAULT 0'"],
  [assurance,"'approvedBy', 'TEXT'"],
  [script,"bindings[0].get('database_id') != db_id"],
  [script,"'--remote'"],
  [script,'ASSURANCE_REVIEW_SCHEMA_READY'],
  [deploy,'Migrate existing assurance review columns on pinned D1'],
  [deploy,'python scripts/migrate-assurance-review-columns.py'],
  [integrity,'d.humanApproved'],
];
for(const [content,term] of markers)assert.ok(content.includes(term),'missing assurance migration contract: '+term);
assert.ok(!script.includes('UPDATE ControlDeficiency')&&!script.includes('DELETE FROM ControlDeficiency'),
 'Migration must not change business assessment records');
console.log('PASS existing D1 assurance columns: idempotent, pinned, additive-only, preserves reviewed data');
