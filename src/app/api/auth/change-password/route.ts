import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ApiError, apiError, clientIp, readJson, requireString } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-token';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');

    const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request, 16_000);
    const currentPassword = requireString(body.currentPassword, 'currentPassword', 256);
    const newPassword = requireString(body.newPassword, 'newPassword', 256);

    const dbUser = await prisma.user.findFirst({ where: { id: user.id, active: true } });
    if (!dbUser?.passwordHash || !(await verifyPassword(currentPassword, dbUser.passwordHash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    if (currentPassword === newPassword) throw new ApiError(400, 'PASSWORD_REUSE', 'New password must be different from the current password');

    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null
      }
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
        action: 'CHANGE_PASSWORD',
        entityType: 'User',
        recordId: user.id,
        reason: 'User changed account password',
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        correlationId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
