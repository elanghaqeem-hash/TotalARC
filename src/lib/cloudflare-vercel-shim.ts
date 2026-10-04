/**
 * Node-hosting compatibility shim for code that normally runs on Cloudflare Workers.
 *
 * Node-hosted deployments (cPanel/Passenger or Vercel) can expose a D1-compatible
 * DB surface through one of two backends:
 *   - Cloudflare D1 over HTTPS (default)
 *   - local SQLite on the hosting server (TOTAL_ARC_DB_BACKEND=sqlite)
 *
 * Cloudflare/OpenNext builds do not use this file and continue to receive native
 * bindings directly from Workers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type QueryMeta = Record<string, unknown> & {
  changes?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
  last_row_id?: number | string;
};

type QueryResult<T = Record<string, unknown>> = {
  success?: boolean;
  results?: T[];
  meta?: QueryMeta;
};

type CloudflareApiEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
};

type BoundQuery = {
  sql: string;
  params: unknown[];
};

type D1PreparedStatementLike = {
  readonly __totalArcBoundQuery: BoundQuery;
  bind: (...values: unknown[]) => D1PreparedStatementLike;
  all: <T = Record<string, unknown>>() => Promise<QueryResult<T>>;
  first: <T = Record<string, unknown>>(columnName?: string) => Promise<T | null>;
  run: () => Promise<QueryResult>;
  raw: <T = unknown[]>(options?: { columnNames?: boolean }) => Promise<T[]>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1PreparedStatementLike;
  exec: (sql: string) => Promise<{ count: number; duration: number }>;
  batch: (statements: unknown[]) => Promise<QueryResult[]>;
};

function envValue(name: string) {
  return typeof process.env[name] === 'string' ? String(process.env[name]).trim() : '';
}

function normalizeParam(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return String(value);
}

function normalizeSqliteParam(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function dbBackend() {
  return envValue('TOTAL_ARC_DB_BACKEND').toLowerCase() || 'd1';
}

function d1Config() {
  const accountId = envValue('CLOUDFLARE_ACCOUNT_ID');
  const databaseId =
    envValue('TOTAL_ARC_D1_DATABASE_ID') || envValue('CLOUDFLARE_D1_DATABASE_ID');
  const apiToken =
    envValue('CLOUDFLARE_D1_API_TOKEN') || envValue('CLOUDFLARE_API_TOKEN');

  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

function sqlitePath() {
  const configured = envValue('TOTAL_ARC_SQLITE_PATH');
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), '.totalarc-data', 'totalarc.db');
}

function timeoutMs() {
  const configured = Number(envValue('TOTAL_ARC_D1_HTTP_TIMEOUT_MS') || '15000');
  if (!Number.isFinite(configured)) return 15000;
  return Math.min(Math.max(Math.trunc(configured), 1000), 60000);
}

class VercelD1HttpClient {
  constructor(
    private readonly accountId: string,
    private readonly databaseId: string,
    private readonly apiToken: string
  ) {}

  private endpoint() {
    return (
      'https://api.cloudflare.com/client/v4/accounts/' +
      encodeURIComponent(this.accountId) +
      '/d1/database/' +
      encodeURIComponent(this.databaseId) +
      '/query'
    );
  }

  private async request(
    body: { sql: string; params?: Array<string | number | boolean | null> } | {
      batch: Array<{ sql: string; params?: Array<string | number | boolean | null> }>;
    }
  ): Promise<QueryResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store'
      });

      const payload = (await response.json().catch(() => ({}))) as CloudflareApiEnvelope<QueryResult[]>;
      const errors = Array.isArray(payload.errors) ? payload.errors : [];

      if (!response.ok || payload.success === false || errors.length > 0 || !Array.isArray(payload.result)) {
        const detail = errors
          .map(item => item.message || (item.code ? 'Cloudflare error ' + item.code : 'Cloudflare D1 error'))
          .filter(Boolean)
          .join('; ');
        throw new Error(
          'D1_HTTP_QUERY_FAILED:' +
            response.status +
            ':' +
            (detail || response.statusText || 'Unknown error')
        );
      }

      for (const item of payload.result) {
        if (item?.success === false) {
          throw new Error('D1_HTTP_QUERY_FAILED:QUERY_UNSUCCESSFUL');
        }
      }

      return payload.result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('D1_HTTP_QUERY_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const result = await this.request({
      sql,
      params: params.map(normalizeParam)
    });
    return (result[0] || { success: true, results: [] }) as QueryResult<T>;
  }

  async exec(sql: string) {
    return this.request({ sql });
  }

  async batch(queries: BoundQuery[]) {
    if (queries.length === 0) return [];
    return this.request({
      batch: queries.map(item => ({
        sql: item.sql,
        params: item.params.map(normalizeParam)
      }))
    });
  }
}

class D1HttpPreparedStatement implements D1PreparedStatementLike {
  readonly __totalArcBoundQuery: BoundQuery;

  constructor(
    private readonly client: VercelD1HttpClient,
    sql: string,
    params: unknown[] = []
  ) {
    this.__totalArcBoundQuery = { sql, params };
  }

  bind(...values: unknown[]) {
    return new D1HttpPreparedStatement(this.client, this.__totalArcBoundQuery.sql, values);
  }

  async all<T = Record<string, unknown>>() {
    return this.client.query<T>(this.__totalArcBoundQuery.sql, this.__totalArcBoundQuery.params);
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const result = await this.all<Record<string, unknown>>();
    const row = result.results?.[0] || null;
    if (!row) return null;
    if (columnName) return (row[columnName] ?? null) as T | null;
    return row as T;
  }

  async run() {
    return this.client.query(this.__totalArcBoundQuery.sql, this.__totalArcBoundQuery.params);
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    const result = await this.all<Record<string, unknown>>();
    const rows = result.results || [];
    if (rows.length === 0) return [] as T[];
    const columns = Object.keys(rows[0]);
    const values = rows.map(row => columns.map(column => row[column]));
    return (options?.columnNames ? [columns, ...values] : values) as T[];
  }
}

class D1HttpDatabase implements D1DatabaseLike {
  constructor(private readonly client: VercelD1HttpClient) {}

  prepare(sql: string) {
    return new D1HttpPreparedStatement(this.client, sql);
  }

  async exec(sql: string) {
    const results = await this.client.exec(sql);
    return {
      count: results.length,
      duration: results.reduce((total, item) => total + Number(item.meta?.duration || 0), 0)
    };
  }

  async batch(statements: unknown[]) {
    const queries = statements.map(statement => {
      if (
        statement instanceof D1HttpPreparedStatement ||
        (typeof statement === 'object' &&
          statement !== null &&
          '__totalArcBoundQuery' in statement)
      ) {
        return (statement as D1PreparedStatementLike).__totalArcBoundQuery;
      }
      throw new Error('D1_HTTP_BATCH_INVALID_STATEMENT');
    });
    return this.client.batch(queries);
  }
}

class LocalSqlitePreparedStatement implements D1PreparedStatementLike {
  readonly __totalArcBoundQuery: BoundQuery;

  constructor(
    private readonly database: DatabaseSync,
    sql: string,
    params: unknown[] = []
  ) {
    this.__totalArcBoundQuery = { sql, params };
  }

  bind(...values: unknown[]) {
    return new LocalSqlitePreparedStatement(
      this.database,
      this.__totalArcBoundQuery.sql,
      values
    );
  }

  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const statement = this.database.prepare(this.__totalArcBoundQuery.sql);
    const params = this.__totalArcBoundQuery.params.map(normalizeSqliteParam);
    const rows = statement.all(...params) as T[];
    return {
      success: true,
      results: rows,
      meta: { rows_read: rows.length, rows_written: 0 }
    };
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const statement = this.database.prepare(this.__totalArcBoundQuery.sql);
    const params = this.__totalArcBoundQuery.params.map(normalizeSqliteParam);
    const row = (statement.get(...params) || null) as Record<string, unknown> | null;
    if (!row) return null;
    if (columnName) return (row[columnName] ?? null) as T | null;
    return row as T;
  }

  async run(): Promise<QueryResult> {
    const statement = this.database.prepare(this.__totalArcBoundQuery.sql);
    const params = this.__totalArcBoundQuery.params.map(normalizeSqliteParam);
    const result = statement.run(...params);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes || 0),
        rows_read: 0,
        rows_written: Number(result.changes || 0),
        last_row_id:
          typeof result.lastInsertRowid === 'bigint'
            ? result.lastInsertRowid.toString()
            : Number(result.lastInsertRowid || 0)
      }
    };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    const result = await this.all<Record<string, unknown>>();
    const rows = result.results || [];
    if (rows.length === 0) return [] as T[];
    const columns = Object.keys(rows[0]);
    const values = rows.map(row => columns.map(column => row[column]));
    return (options?.columnNames ? [columns, ...values] : values) as T[];
  }
}

class LocalSqliteDatabase implements D1DatabaseLike {
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA journal_mode=WAL;');
    this.database.exec('PRAGMA synchronous=NORMAL;');
    this.database.exec('PRAGMA busy_timeout=5000;');
    this.database.exec('PRAGMA foreign_keys=ON;');
  }

  prepare(sql: string) {
    return new LocalSqlitePreparedStatement(this.database, sql);
  }

  async exec(sql: string) {
    const startedAt = Date.now();
    this.database.exec(sql);
    return {
      count: sql
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean).length,
      duration: Date.now() - startedAt
    };
  }

  async batch(statements: unknown[]) {
    const queries = statements.map(statement => {
      if (
        statement instanceof LocalSqlitePreparedStatement ||
        (typeof statement === 'object' &&
          statement !== null &&
          '__totalArcBoundQuery' in statement)
      ) {
        return (statement as D1PreparedStatementLike).__totalArcBoundQuery;
      }
      throw new Error('LOCAL_SQLITE_BATCH_INVALID_STATEMENT');
    });

    const results: QueryResult[] = [];
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const item of queries) {
        const statement = this.database.prepare(item.sql);
        const params = item.params.map(normalizeSqliteParam);
        const result = statement.run(...params);
        results.push({
          success: true,
          results: [],
          meta: {
            changes: Number(result.changes || 0),
            rows_read: 0,
            rows_written: Number(result.changes || 0),
            last_row_id:
              typeof result.lastInsertRowid === 'bigint'
                ? result.lastInsertRowid.toString()
                : Number(result.lastInsertRowid || 0)
          }
        });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      try {
        this.database.exec('ROLLBACK');
      } catch {}
      throw error;
    }
  }
}

let database: D1DatabaseLike | null | undefined;

function runtimeDatabase() {
  if (database !== undefined) return database;

  if (dbBackend() === 'sqlite') {
    if (envValue('TOTAL_ARC_NODE_RUNTIME') !== '1') {
      throw new Error(
        'TOTAL_ARC_DB_BACKEND=sqlite is supported only on TOTAL_ARC_NODE_RUNTIME=1.'
      );
    }
    database = new LocalSqliteDatabase(sqlitePath());
    return database;
  }

  const config = d1Config();
  database = config
    ? new D1HttpDatabase(
        new VercelD1HttpClient(config.accountId, config.databaseId, config.apiToken)
      )
    : null;
  return database;
}

function runtimeEnv() {
  const env: Record<string, unknown> = { ...process.env };
  const db = runtimeDatabase();
  if (db) env.DB = db;
  return env;
}

export function getCloudflareContext(_options?: unknown) {
  return {
    env: runtimeEnv(),
    ctx: {
      waitUntil: (_promise: Promise<unknown>) => undefined,
      passThroughOnException: () => undefined,
      props: {}
    },
    cf: undefined
  };
}

export function initOpenNextCloudflareForDev() {
  // No-op on Node hosting. Cloudflare builds continue using the real OpenNext package.
}
