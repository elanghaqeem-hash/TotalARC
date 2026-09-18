import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

export type AuthUser = {
  id: string;
  institutionId: string;
  institutionName: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  sessionVersion: number;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, active: true },
    include: { institution: { select: { id: true, name: true } } }
  });

  if (!user || user.sessionVersion !== payload.sv) return null;

  return {
    id: user.id,
    institutionId: user.institutionId,
    institutionName: user.institution.name,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    sessionVersion: user.sessionVersion
  };
}

export function isPlatformAdmin(user: AuthUser) {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
  return user.role === 'Admin' && allowed.includes(user.email.toLowerCase());
}
