import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session-token';

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return NextResponse.json({ success: true });
}
