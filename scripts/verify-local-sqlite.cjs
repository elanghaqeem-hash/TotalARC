#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const file = path.resolve(String(process.env.TOTAL_ARC_SQLITE_PATH || '').trim());
if (!process.env.TOTAL_ARC_SQLITE_PATH) {
  console.error('Missing TOTAL_ARC_SQLITE_PATH');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error('SQLite database does not exist:', file);
  process.exit(1);
}

const db = new DatabaseSync(file, { readOnly: true });
const integrity = db.prepare('PRAGMA integrity_check').get();
const integrityValue = String(Object.values(integrity || {})[0] || '');

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all().map(row => String(row.name));

const critical = [
  'Institution',
  'AuthUser',
  'AuthSession',
  'AuditLog',
  'OrganizationUnit',
  'BusinessProcess',
  'RiskMaster',
  'ControlMaster'
];

const counts = {};
for (const name of critical) {
  if (!tables.includes(name)) {
    counts[name] = null;
    continue;
  }
  const q = '"' + name.replace(/"/g, '""') + '"';
  counts[name] = Number(db.prepare('SELECT COUNT(*) AS count FROM ' + q).get()?.count || 0);
}

const missing = critical.filter(name => !tables.includes(name));
const reportPath = file + '.migration-report.json';
let migrationReport = null;
if (fs.existsSync(reportPath)) {
  try {
    migrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {}
}

console.log(JSON.stringify({
  ok: integrityValue.toLowerCase() === 'ok' && missing.length === 0,
  database: file,
  integrity: integrityValue,
  tableCount: tables.length,
  missingCriticalTables: missing,
  criticalCounts: counts,
  migrationReportPresent: Boolean(migrationReport),
  migrationCompletedAt: migrationReport?.completedAt || null
}, null, 2));

db.close();
