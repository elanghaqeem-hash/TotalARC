import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { TenantAuthenticatedUser } from '@/lib/api-auth';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('ORGANIZATION_SCOPE_DATABASE_UNAVAILABLE');
  return db;
}

export type OrganizationAccess = {
  unrestricted: boolean;
  unitIds: string[];
  primaryOrgUnitId: string | null;
  accessScope: 'Institution' | 'Unit' | 'UnitAndDescendants';
};

export async function resolveOrganizationAccess(
  user: TenantAuthenticatedUser
): Promise<OrganizationAccess> {
  if (user.role === 'Admin' || user.accessScope === 'Institution') {
    return {
      unrestricted: true,
      unitIds: [],
      primaryOrgUnitId: user.orgUnitId || null,
      accessScope: 'Institution'
    };
  }

  if (!user.orgUnitId) {
    return {
      unrestricted: false,
      unitIds: [],
      primaryOrgUnitId: null,
      accessScope: user.accessScope
    };
  }

  const db = await getDb();
  const primary = await db.prepare(
    'SELECT id FROM OrganizationUnit WHERE id = ? AND institutionId = ? AND status = ? LIMIT 1'
  ).bind(user.orgUnitId, user.institutionId, 'Active').first<{ id?: string }>();

  if (!primary?.id) {
    return {
      unrestricted: false,
      unitIds: [],
      primaryOrgUnitId: user.orgUnitId,
      accessScope: user.accessScope
    };
  }

  if (user.accessScope === 'Unit') {
    return {
      unrestricted: false,
      unitIds: [user.orgUnitId],
      primaryOrgUnitId: user.orgUnitId,
      accessScope: 'Unit'
    };
  }

  const result = await db.prepare(
    'SELECT id, parentId FROM OrganizationUnit WHERE institutionId = ? AND status = ?'
  ).bind(user.institutionId, 'Active').all<{ id?: string; parentId?: string | null }>();

  const children = new Map<string, string[]>();
  for (const row of result.results || []) {
    const id = String(row.id || '');
    const parentId = row.parentId ? String(row.parentId) : '';
    if (!id || !parentId) continue;
    const list = children.get(parentId) || [];
    list.push(id);
    children.set(parentId, list);
  }

  const allowed = new Set<string>([user.orgUnitId]);
  const queue = [user.orgUnitId];

  while (queue.length) {
    const current = queue.shift() as string;
    for (const child of children.get(current) || []) {
      if (allowed.has(child)) continue;
      allowed.add(child);
      queue.push(child);
    }
  }

  return {
    unrestricted: false,
    unitIds: [...allowed],
    primaryOrgUnitId: user.orgUnitId,
    accessScope: 'UnitAndDescendants'
  };
}

export function organizationScopeAllows(
  access: OrganizationAccess,
  orgUnitId: unknown
) {
  if (access.unrestricted) return true;
  if (typeof orgUnitId !== 'string' || !orgUnitId) return false;
  return access.unitIds.includes(orgUnitId);
}

export function filterByOrganizationScope<T extends { orgUnitId?: unknown }>(
  rows: T[],
  access: OrganizationAccess
): T[] {
  if (access.unrestricted) return rows;
  const allowed = new Set(access.unitIds);
  return rows.filter(row => typeof row.orgUnitId === 'string' && allowed.has(row.orgUnitId));
}

export function assertOrganizationScope(
  access: OrganizationAccess,
  orgUnitId: unknown
) {
  if (!organizationScopeAllows(access, orgUnitId)) {
    throw new Error('ORGANIZATION_SCOPE_FORBIDDEN');
  }
}
