/**
 * Hostinger / generic Node.js compatibility shim for TotalARC.
 *
 * It exposes the subset of @opennextjs/cloudflare used by TotalARC while
 * running under the standard Next.js Node runtime. Database options:
 *
 * - TOTAL_ARC_DB_DRIVER=sqlite  -> local SQLite file through Prisma (recommended)
 * - TOTAL_ARC_DB_DRIVER=d1-http -> existing Cloudflare D1 through HTTPS
 *
 * If TOTAL_ARC_DB_DRIVER is omitted, sqlite is used on Hostinger.
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { getCloudflareContext as getD1HttpContext } from './cloudflare-vercel-shim';

type QueryMeta = {
  changes?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
};

type QueryResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta: QueryMeta;
};

type BoundQuery = {
  sql: string;
  params: unknown[];
};

function envValue(name: string) {
  return typeof process.env[name] === 'string' ? String(process.env[name]).trim() : '';
}

function driver() {
  const configured = envValue('TOTAL_ARC_DB_DRIVER').toLowerCase();
  if (configured === 'd1-http' || configured === 'cloudflare-d1') return 'd1-http';
  return 'sqlite';
}

function sqlitePath() {
  const configured = envValue('TOTAL_ARC_SQLITE_PATH');
  const resolved = path.resolve(process.cwd(), configured || 'data/totalarc.db');
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function sqliteUrl() {
  return 'file:' + sqlitePath();
}

type GlobalWithTotalArcPrisma = typeof globalThis & {
  __totalArcHostingerPrisma?: PrismaClient;
  __totalArcHostingerPrismaUrl?: string;
};

function localPrisma() {
  const globalState = globalThis as GlobalWithTotalArcPrisma;
  const url = sqliteUrl();

  if (
    globalState.__totalArcHostingerPrisma &&
    globalState.__totalArcHostingerPrismaUrl === url
  ) {
    return globalState.__totalArcHostingerPrisma;
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  globalState.__totalArcHostingerPrisma = prisma;
  globalState.__totalArcHostingerPrismaUrl = url;
  return prisma;
}

function normalizeParam(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function looksLikeRead(sql: string) {
  const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toUpperCase();
  return (
    normalized.startsWith('SELECT ') ||
    normalized.startsWith('PRAGMA ') ||
    normalized.startsWith('EXPLAIN ') ||
    normalized.startsWith('WITH ') ||
    /\bRETURNING\b/i.test(sql)
  );
}

async function queryRows<T = Record<string, unknown>>(sql: string, params: unknown[]) {
  const started = Date.now();
  const prisma = localPrisma();
  const values = params.map(normalizeParam);
  const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...values);
  return {
    success: true,
    results: Array.isArray(rows) ? rows : [],
    meta: {
      duration: Date.now() - started,
      rows_read: Array.isArray(rows) ? rows.length : 0,
    },
  } satisfies QueryResult<T>;
}

async function executeStatement(sql: string, params: unknown[]) {
  const started = Date.now();
  const prisma = localPrisma();
  const values = params.map(normalizeParam);

  if (looksLikeRead(sql)) {
    const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values);
    return {
      success: true,
      results: Array.isArray(result) ? result : [],
      meta: {
        duration: Date.now() - started,
        rows_read: Array.isArray(result) ? result.length : 0,
      },
    } satisfies QueryResult;
  }

  const changes = await prisma.$executeRawUnsafe(sql, ...values);
  return {
    success: true,
    results: [],
    meta: {
      duration: Date.now() - started,
      changes: Number(changes || 0),
      rows_written: Number(changes || 0),
    },
  } satisfies QueryResult;
}

function splitSqlStatements(script: string) {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < script.length; index += 1) {
    const char = script[index];
    const next = script[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (!quote && char === '-' && next === '-') {
      current += char + next;
      index += 1;
      lineComment = true;
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      current += char + next;
      index += 1;
      blockComment = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char as "'" | '"' | '`';
      current += char;
      continue;
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

class NodeD1PreparedStatement {
  readonly __totalArcBoundQuery: BoundQuery;

  constructor(sql: string, params: unknown[] = []) {
    this.__totalArcBoundQuery = { sql, params };
  }

  bind(...values: unknown[]) {
    return new NodeD1PreparedStatement(this.__totalArcBoundQuery.sql, values);
  }

  async all<T = Record<string, unknown>>() {
    return queryRows<T>(this.__totalArcBoundQuery.sql, this.__totalArcBoundQuery.params);
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const result = await this.all<Record<string, unknown>>();
    const row = result.results[0] || null;
    if (!row) return null;
    if (columnName) return (row[columnName] ?? null) as T | null;
    return row as T;
  }

  async run() {
    return executeStatement(this.__totalArcBoundQuery.sql, this.__totalArcBoundQuery.params);
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    const result = await this.all<Record<string, unknown>>();
    if (result.results.length === 0) return [] as T[];
    const columns = Object.keys(result.results[0]);
    const values = result.results.map(row => columns.map(column => row[column]));
    return (options?.columnNames ? [columns, ...values] : values) as T[];
  }
}

class NodeD1Database {
  prepare(sql: string) {
    return new NodeD1PreparedStatement(sql);
  }

  async exec(sql: string) {
    const started = Date.now();
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
      await executeStatement(statement, []);
    }
    return {
      count: statements.length,
      duration: Date.now() - started,
    };
  }

  async batch(statements: unknown[]) {
    const results: QueryResult[] = [];
    for (const statement of statements) {
      if (
        statement instanceof NodeD1PreparedStatement ||
        (typeof statement === 'object' &&
          statement !== null &&
          '__totalArcBoundQuery' in statement)
      ) {
        const query = (statement as NodeD1PreparedStatement).__totalArcBoundQuery;
        results.push(await executeStatement(query.sql, query.params));
        continue;
      }
      throw new Error('D1_NODE_BATCH_INVALID_STATEMENT');
    }
    return results;
  }

  withSession(_bookmark?: string) {
    return this;
  }
}

let localDatabase: NodeD1Database | null = null;

function runtimeEnv() {
  const env: Record<string, unknown> = { ...process.env };
  if (!localDatabase) localDatabase = new NodeD1Database();
  env.DB = localDatabase;
  return env;
}

export function getCloudflareContext(options?: unknown) {
  if (driver() === 'd1-http') {
    return getD1HttpContext(options);
  }

  return {
    env: runtimeEnv(),
    ctx: {
      waitUntil: (_promise: Promise<unknown>) => undefined,
      passThroughOnException: () => undefined,
      props: {},
    },
    cf: undefined,
  };
}

export function initOpenNextCloudflareForDev() {
  // No-op in the standard Node.js runtime.
}
