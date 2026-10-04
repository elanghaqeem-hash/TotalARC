#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function env(name) {
  return String(process.env[name] || '').trim();
}

function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
}

const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
const databaseId =
  env('TOTAL_ARC_D1_DATABASE_ID') || requireEnv('CLOUDFLARE_D1_DATABASE_ID');
const token =
  env('CLOUDFLARE_D1_API_TOKEN') || requireEnv('CLOUDFLARE_API_TOKEN');
const destination = path.resolve(
  requireEnv('TOTAL_ARC_SQLITE_PATH')
);
const overwrite = env('TOTAL_ARC_SQLITE_MIGRATE_OVERWRITE') === '1';
const batchSize = Math.max(
  50,
  Math.min(1000, Number(env('TOTAL_ARC_SQLITE_MIGRATE_BATCH') || '500'))
);

const endpoint =
  'https://api.cloudflare.com/client/v4/accounts/' +
  encodeURIComponent(accountId) +
  '/d1/database/' +
  encodeURIComponent(databaseId) +
  '/query';

async function d1(sql, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const payload = await response.json().catch(() => ({}));
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (!response.ok || payload.success === false || errors.length || !Array.isArray(payload.result)) {
    const detail = errors.map(x => x.message || x.code).filter(Boolean).join('; ');
    throw new Error('D1 query failed (' + response.status + '): ' + (detail || response.statusText));
  }
  const first = payload.result[0] || {};
  if (first.success === false) throw new Error('D1 query unsuccessful: ' + sql.slice(0, 120));
  return first;
}

function qid(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function safeRemove(file) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(file + suffix); } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
  }
}

(async () => {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });

  if (fs.existsSync(destination)) {
    if (!overwrite) {
      throw new Error(
        'Destination already exists: ' + destination +
        '. Set TOTAL_ARC_SQLITE_MIGRATE_OVERWRITE=1 only after taking a backup.'
      );
    }
    const backup = destination + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(destination, backup);
    console.log('Existing database backed up to:', backup);
  }

  const temp = destination + '.migrating';
  safeRemove(temp);

  console.log('Reading D1 schema...');
  const schemaResult = await d1(
    "SELECT type,name,tbl_name,sql FROM sqlite_master " +
    "WHERE sql IS NOT NULL AND type IN ('table','index','trigger') " +
    "AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END,name"
  );
  const schemaRows = schemaResult.results || [];
  const tableRows = schemaRows.filter(row => row.type === 'table');
  const secondaryObjects = schemaRows.filter(row => row.type !== 'table');

  if (!tableRows.length) throw new Error('No application tables found in D1.');

  const db = new DatabaseSync(temp);
  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA busy_timeout=5000;');

  console.log('Creating', tableRows.length, 'tables...');
  for (const row of tableRows) {
    db.exec(String(row.sql));
  }

  const report = {
    source: { accountId, databaseId },
    destination,
    startedAt: new Date().toISOString(),
    batchSize,
    tables: [],
    objectsCreated: 0,
    integrity: null
  };

  for (const table of tableRows) {
    const name = String(table.name);
    const countResult = await d1('SELECT COUNT(*) AS count FROM ' + qid(name));
    const sourceCount = Number((countResult.results || [])[0]?.count || 0);

    const pragma = await d1('PRAGMA table_info(' + qid(name) + ')');
    const columns = (pragma.results || []).map(row => String(row.name)).filter(Boolean);
    if (!columns.length) throw new Error('Could not determine columns for table ' + name);

    const placeholders = columns.map(() => '?').join(',');
    const insert = db.prepare(
      'INSERT INTO ' + qid(name) +
      ' (' + columns.map(qid).join(',') + ') VALUES (' + placeholders + ')'
    );

    let copied = 0;
    for (let offset = 0; offset < sourceCount; offset += batchSize) {
      const page = await d1(
        'SELECT * FROM ' + qid(name) + ' LIMIT ? OFFSET ?',
        [batchSize, offset]
      );
      const rows = page.results || [];
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          insert.run(...columns.map(column => normalizeValue(row[column])));
        }
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
      copied += rows.length;
      process.stdout.write(
        '\r' + name + ': ' + copied + '/' + sourceCount + ' rows'
      );
    }
    process.stdout.write('\n');

    const localCount = Number(
      db.prepare('SELECT COUNT(*) AS count FROM ' + qid(name)).get()?.count || 0
    );
    report.tables.push({
      name,
      sourceRows: sourceCount,
      localRows: localCount,
      match: sourceCount === localCount
    });

    if (sourceCount !== localCount) {
      throw new Error(
        'Row-count mismatch for ' + name + ': source=' + sourceCount + ', local=' + localCount
      );
    }
  }

  console.log('Creating indexes and triggers...');
  for (const row of secondaryObjects) {
    try {
      db.exec(String(row.sql));
      report.objectsCreated += 1;
    } catch (error) {
      throw new Error(
        'Failed creating ' + row.type + ' ' + row.name + ': ' +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  db.exec('PRAGMA foreign_keys=ON;');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const integrityValue = String(Object.values(integrity || {})[0] || '');
  report.integrity = integrityValue;
  report.completedAt = new Date().toISOString();

  if (integrityValue.toLowerCase() !== 'ok') {
    throw new Error('SQLite integrity_check failed: ' + integrityValue);
  }
  if (report.tables.some(item => !item.match)) {
    throw new Error('One or more table row counts did not match.');
  }

  db.close();

  if (overwrite) safeRemove(destination);
  fs.renameSync(temp, destination);

  const reportPath = destination + '.migration-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  try { fs.chmodSync(destination, 0o600); } catch {}

  console.log('');
  console.log('MIGRATION COMPLETE');
  console.log('Database:', destination);
  console.log('Tables:', report.tables.length);
  console.log('Integrity:', report.integrity);
  console.log('Report:', reportPath);
  console.log('');
  console.log('Do NOT switch production yet until the report is reviewed.');
})().catch(error => {
  console.error('MIGRATION FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
