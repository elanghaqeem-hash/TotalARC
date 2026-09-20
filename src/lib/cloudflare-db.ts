import { getCloudflareContext } from '@opennextjs/cloudflare';

export type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

export const TENANT_DATABASE_BINDINGS = [
  'DB',
  'TENANT_DB_01',
  'TENANT_DB_02',
  'TENANT_DB_03',
  'TENANT_DB_04',
  'TENANT_DB_05',
  'TENANT_DB_06',
  'TENANT_DB_07',
  'TENANT_DB_08'
] as const;

type RuntimeEnv = Record<string, unknown>;

export async function getRuntimeEnv(): Promise<RuntimeEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as RuntimeEnv;
}

function asD1(value: unknown): D1DatabaseLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<D1DatabaseLike>;
  return typeof candidate.prepare === 'function' && typeof candidate.exec === 'function'
    ? (value as D1DatabaseLike)
    : null;
}

export async function getControlPlaneDb(): Promise<D1DatabaseLike> {
  const env = await getRuntimeEnv();
  const db = asD1(env.DB);
  if (!db) throw new Error('Cloudflare D1 control-plane binding "DB" is not available.');
  return db;
}

export async function getDatabaseBinding(binding: string): Promise<D1DatabaseLike> {
  const normalized = String(binding || '').trim().toUpperCase();
  if (!TENANT_DATABASE_BINDINGS.includes(normalized as (typeof TENANT_DATABASE_BINDINGS)[number])) {
    throw new Error('TENANT_DATABASE_BINDING_NOT_ALLOWED');
  }
  const env = await getRuntimeEnv();
  const db = asD1(env[normalized]);
  if (!db) throw new Error('Tenant D1 binding "' + normalized + '" is not available.');
  return db;
}

export async function getRuntimeSecret(name: string): Promise<string> {
  const env = await getRuntimeEnv();
  const value = env[name];
  if (typeof value !== 'string' || value.length < 24) {
    throw new Error('Runtime secret "' + name + '" is not configured.');
  }
  return value;
}
