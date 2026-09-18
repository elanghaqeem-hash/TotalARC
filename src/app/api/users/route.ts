import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiUser } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const users = await prisma.user.findMany({
      where: { institutionId: user.institutionId, active: true },
      select: { id: true, name: true, role: true, department: true },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json({ users });
  } catch (error) { return apiError(error); }
}
