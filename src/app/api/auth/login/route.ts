import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-token';
import { ApiError, apiError, clientIp, readJson, requireString } from '@/lib/api';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: unknown; password?: unknown }>(request, 16_000);
    const email = requireString(body.email, 'email', 254).toLowerCase();
    const password = requireString(body.password, 'password', 256);

    const user = await prisma.user.findUnique({ where: { email }, include: { institution: true } });
    const now = new Date();

    if (!user || !user.active || !user.passwordHash) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new ApiError(429, 'ACCOUNT_LOCKED', 'Account temporarily locked after repeated failed sign-in attempts');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts,
          lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null
        }
      });
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, lastLoginIp: clientIp(request) }
    });

    const token = await createSessionToken(updated.id, updated.sessionVersion);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);

    await prisma.auditLog.create({
      data: {
        institutionId: user.institutionId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN',
        entityType: 'Session',
        recordId: user.id,
        reason: 'Successful authentication',
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        correlationId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        institutionId: user.institutionId,
        institutionName: user.institution.name
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
