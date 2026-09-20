import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySessionToken, type SessionPayload } from '@/lib/auth-token';
import { getDatabaseBinding, type D1DatabaseLike } from '@/lib/cloudflare-db';

export async function getCurrentSecurityContext(): Promise<SessionPayload> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value || '';
  if (!token) throw new Error('AUTH_REQUIRED');
  const payload = await verifySessionToken(token);
  if (!payload) throw new Error('INVALID_SESSION');
  return payload;
}

export async function getTenantDb(): Promise<D1DatabaseLike> {
  const security = await getCurrentSecurityContext();
  return getDatabaseBinding(security.institution.databaseBinding);
}

export async function getTenantContext() {
  const security = await getCurrentSecurityContext();
  const db = await getDatabaseBinding(security.institution.databaseBinding);
  return {
    db,
    security,
    institutionId: security.institution.id,
    databaseBinding: security.institution.databaseBinding,
    folderKey: security.institution.folderKey,
    unitIds: security.unitIds,
    permissions: security.permissions,
    roles: security.roles
  };
}
