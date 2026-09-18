import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { assertSameOrigin, clientIp } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/session-token';

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await getCurrentUser();

  if (user) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } }),
      prisma.auditLog.create({
        data: {
          institutionId: user.institutionId,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'LOGOUT',
          entityType: 'Session',
          recordId: user.id,
          reason: 'User signed out and invalidated active session version',
          ipAddress: clientIp(request),
          userAgent: request.headers.get('user-agent'),
          correlationId: request.headers.get('x-request-id') || crypto.randomUUID()
        }
      })
    ]);
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return NextResponse.json({ success: true });
}
