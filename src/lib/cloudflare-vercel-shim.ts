/**
 * Vercel compatibility shim for code that normally runs on Cloudflare Workers.
 *
 * On Vercel, Next.js bundles imports of `@opennextjs/cloudflare` to this module
 * (see next.config.mjs). It exposes a minimal getCloudflareContext() surface and
 * provides a D1-compatible adapter backed by Cloudflare's HTTPS D1 API.
 *
 * Cloudflare/OpenNext builds do not use this file and continue to receive native
 * bindings directly from Workers.
 */

type QueryMeta = Record<string, unknown> & {
  changes?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
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

function d1Config() {
  const accountId = envValue('CLOUDFLARE_ACCOUNT_ID');
  const databaseId =
    envValue('TOTAL_ARC_D1_DATABASE_ID') || envValue('CLOUDFLARE_D1_DATABASE_ID');
  const apiToken =
    envValue('CLOUDFLARE_D1_API_TOKEN') || envValue('CLOUDFLARE_API_TOKEN');

  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
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

class VercelD1PreparedStatement {
  readonly __totalArcBoundQuery: BoundQuery;

  constructor(
    private readonly client: VercelD1HttpClient,
    sql: string,
    params: unknown[] = []
  ) {
    this.__totalArcBoundQuery = { sql, params };
  }

  bind(...values: unknown[]) {
    return new VercelD1PreparedStatement(this.client, this.__totalArcBoundQuery.sql, values);
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

class VercelD1Database {
  constructor(private readonly client: VercelD1HttpClient) {}

  prepare(sql: string) {
    return new VercelD1PreparedStatement(this.client, sql);
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
        statement instanceof VercelD1PreparedStatement ||
        (typeof statement === 'object' &&
          statement !== null &&
          '__totalArcBoundQuery' in statement)
      ) {
        return (statement as VercelD1PreparedStatement).__totalArcBoundQuery;
      }
      throw new Error('D1_HTTP_BATCH_INVALID_STATEMENT');
    });
    return this.client.batch(queries);
  }
}

let database: VercelD1Database | null | undefined;

function runtimeDatabase() {
  if (database !== undefined) return database;
  const config = d1Config();
  database = config
    ? new VercelD1Database(
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
  // No-op on Vercel. Cloudflare builds continue using the real OpenNext package.
}
