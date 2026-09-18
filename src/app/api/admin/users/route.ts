import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { generateTemporaryPassword, hashPassword } from '@/lib/password';
import { writeAudit } from '@/lib/audit';

const ROLES = ['Admin','ProcessOwner','ControlOwner','Tester','Reviewer','Executive','Auditor'];

export async function GET(request: Request) {
  try {
    const actor = await requireApiUser(request, ['Admin']);
    const users = await prisma.user.findMany({
      where: { institutionId: actor.institutionId },
      select: {
        id: true, name: true, email: true, role: true, department: true, active: true,
        mustChangePassword: true, lastLoginAt: true, lockedUntil: true, createdAt: true
      },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json({ users, roles: ROLES });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireApiUser(request, ['Admin']);
    const body = await readJson<Record<string, unknown>>(request, 32_000);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE') {
      const email = requireString(body.email, 'email', 254).toLowerCase();
      const name = requireString(body.name, 'name', 250);
      const role = requireString(body.role, 'role', 60);
      if (!ROLES.includes(role)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid role');
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) throw new ApiError(409, 'EMAIL_EXISTS', 'Email is already registered');

      const temporaryPassword = generateTemporaryPassword();
      const user = await prisma.user.create({
        data: {
          institutionId: actor.institutionId,
          name,
          email,
          role,
          department: optionalString(body.department, 250),
          active: true,
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true
        },
        select: { id: true, name: true, email: true, role: true, department: true, active: true, mustChangePassword: true }
      });

      await writeAudit(actor, request, { action: 'CREATE', entityType: 'User', recordId: user.id, reason: `Provisioned ${role} account for ${email}`, newValue: user });
      return NextResponse.json({ user, temporaryPassword }, { status: 201 });
    }

    if (action === 'RESET_PASSWORD') {
      const id = requireString(body.id, 'id', 100);
      const target = await prisma.user.findFirst({ where: { id, institutionId: actor.institutionId } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
      const temporaryPassword = generateTemporaryPassword();
      await prisma.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          sessionVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });
      await writeAudit(actor, request, { action: 'RESET_PASSWORD', entityType: 'User', recordId: id, reason: `Reset password for ${target.email}` });
      return NextResponse.json({ temporaryPassword });
    }

    if (action === 'SET_ACTIVE') {
      const id = requireString(body.id, 'id', 100);
      const active = body.active === true;
      if (id === actor.id && !active) throw new ApiError(400, 'SELF_DEACTIVATION', 'You cannot deactivate your own account');
      const target = await prisma.user.findFirst({ where: { id, institutionId: actor.institutionId } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
      if (!active && target.role === 'Admin' && target.active) {
        const activeAdmins = await prisma.user.count({
          where: { institutionId: actor.institutionId, role: 'Admin', active: true }
        });
        if (activeAdmins <= 1) {
          throw new ApiError(400, 'LAST_ADMIN', 'The last active tenant administrator cannot be deactivated');
        }
      }
      const updated = await prisma.user.update({ where: { id }, data: { active, sessionVersion: { increment: 1 } } });
      await writeAudit(actor, request, { action: active ? 'ACTIVATE' : 'DEACTIVATE', entityType: 'User', recordId: id, reason: `${active ? 'Activated' : 'Deactivated'} ${target.email}` });
      return NextResponse.json({ user: { id: updated.id, active: updated.active } });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported user administration action');
  } catch (error) {
    return apiError(error);
  }
}
