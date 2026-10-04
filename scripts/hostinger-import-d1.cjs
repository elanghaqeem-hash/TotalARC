const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function env(name) {
  return String(process.env[name] || '').trim();
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error('Missing environment variable: ' + name);
  return value;
}

function q(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function sqliteUrl(filePath) {
  return 'file:' + filePath;
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value) && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Buffer.from(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function main() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const databaseId = required('TOTAL_ARC_D1_DATABASE_ID');
  const token = required('CLOUDFLARE_D1_API_TOKEN');
  const localPath = path.resolve(process.cwd(), env('TOTAL_ARC_SQLITE_PATH') || 'data/totalarc.db');
  const overwrite = env('TOTAL_ARC_IMPORT_OVERWRITE') === '1';

  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  if (fs.existsSync(localPath)) {
    if (!overwrite) {
      throw new Error(
        'Local SQLite file already exists at ' + localPath +
        '. Set TOTAL_ARC_IMPORT_OVERWRITE=1 to replace it after backup.'
      );
    }
    const backup = localPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(localPath, backup);
    console.log('Existing SQLite database moved to ' + backup);
  }

  const endpoint =
    'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(accountId) +
    '/d1/database/' +
    encodeURIComponent(databaseId) +
    '/query';

  async function remote(sql, params = []) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    const body = await response.json().catch(() => ({}));
    const errors = Array.isArray(body.errors) ? body.errors : [];
    if (!response.ok || body.success === false || errors.length || !Array.isArray(body.result)) {
      throw new Error(
        'Cloudflare D1 query failed: ' +
        (errors.map(item => item.message || item.code).join('; ') || response.statusText)
      );
    }

    const result = body.result[0] || { success: true, results: [] };
    if (result.success === false) throw new Error('Cloudflare D1 query unsuccessful.');
    return Array.isArray(result.results) ? result.results : [];
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: sqliteUrl(localPath) } },
    log: ['error'],
  });

  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = OFF');

    const objects = await remote(
      "SELECT type, name, tbl_name AS tblName, sql " +
      "FROM sqlite_master " +
      "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' " +
      "AND type IN ('table','view','index','trigger') " +
      "ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name"
    );

    const tables = objects.filter(item => item.type === 'table');
    const postObjects = objects.filter(item => item.type !== 'table');

    console.log('Creating ' + tables.length + ' tables...');
    for (const item of tables) {
      await prisma.$executeRawUnsafe(String(item.sql));
    }

    const pageSize = 500;
    let totalRows = 0;

    for (const table of tables) {
      const name = String(table.name);
      const columnsInfo = await remote('PRAGMA table_info(' + q(name) + ')');
      const columns = columnsInfo.map(row => String(row.name)).filter(Boolean);
      if (!columns.length) continue;

      let offset = 0;
      let tableRows = 0;

      while (true) {
        const rows = await remote(
          'SELECT * FROM ' + q(name) + ' LIMIT ' + pageSize + ' OFFSET ' + offset
        );
        if (!rows.length) break;

        const maxRowsPerInsert = Math.max(1, Math.floor(800 / columns.length));
        for (let start = 0; start < rows.length; start += maxRowsPerInsert) {
          const chunk = rows.slice(start, start + maxRowsPerInsert);
          const placeholders = chunk
            .map(() => '(' + columns.map(() => '?').join(',') + ')')
            .join(',');
          const values = [];
          for (const row of chunk) {
            for (const column of columns) values.push(normalize(row[column]));
          }

          const sql =
            'INSERT INTO ' + q(name) +
            ' (' + columns.map(q).join(',') + ') VALUES ' + placeholders;
          await prisma.$executeRawUnsafe(sql, ...values);
        }

        tableRows += rows.length;
        totalRows += rows.length;
        offset += rows.length;
        if (rows.length < pageSize) break;
      }

      console.log('Imported ' + name + ': ' + tableRows + ' rows');
    }

    console.log('Creating indexes, views, and triggers...');
    for (const item of postObjects) {
      try {
        await prisma.$executeRawUnsafe(String(item.sql));
      } catch (error) {
        console.warn('Skipped ' + item.type + ' ' + item.name + ': ' + error.message);
      }
    }

    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');

    console.log('D1 migration completed. Total rows copied: ' + totalRows);
    console.log('SQLite database: ' + localPath);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
