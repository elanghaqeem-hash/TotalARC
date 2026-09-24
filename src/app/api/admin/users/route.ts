import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  createManagedUser,
  forceManagedUserPasswordChange,
  getAuthenticatedProfile,
  listManagedUsers,
  resetManagedUserCredential,
  unlockManagedUser,
  updateManagedUser
} from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { isUserRole } from '@/lib/access-control';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context || context.profile.role !== 'Admin' || !context.institution) return null;
  return {
    ...context.profile,
    institutionId: context.institution.id,
    institutionName: context.institution.name
  };
}

function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : 'USER_ADMIN_ERROR';
  const mapping: Record<string, { status: number; error: string }> = {
    USER_REQUIRED_FIELDS: { status: 400, error: 'Nama dan email user wajib diisi.' },
    AUTH_ROLE_INVALID: { status: 400, error: 'Role user tidak valid.' },
    PASSWORD_TOO_SHORT: { status: 400, error: 'Password minimum 12 karakter.' },
    PASSWORD_POLICY: { status: 400, error: 'Password harus 12–128 karakter dan mengandung huruf besar, huruf kecil, angka, serta simbol. Password umum/default tidak diperbolehkan.' },
    PASSWORD_REUSE: { status: 409, error: 'Password sama dengan password saat ini atau salah satu dari lima password terakhir.' },
    USER_EMAIL_CONFLICT: { status: 409, error: 'Email tersebut sudah digunakan.' },
    USER_NOT_FOUND: { status: 404, error: 'User tidak ditemukan.' },
    CANNOT_DISABLE_SELF: { status: 400, error: 'Administrator tidak dapat menonaktifkan akunnya sendiri.' },
    CANNOT_CHANGE_OWN_ROLE: { status: 400, error: 'Administrator tidak dapat mengubah role akunnya sendiri.' },
    CANNOT_RESET_SELF_CREDENTIAL: { status: 409, error: 'Gunakan menu Profile untuk mengubah password akun administrator yang sedang digunakan.' }
  };
  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json(
      { error: mapped.error, code },
      { status: mapped.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  console.error('User administration error:', error);
  return NextResponse.json(
    { error: 'User account tidak dapat diproses.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await listManagedUsers(admin.institutionId);
    return NextResponse.json(
      { users },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'RESET_CREDENTIAL') {
      const result = await resetManagedUserCredential({
        actorUserId: admin.id,
        actorInstitutionId: admin.institutionId,
        userId: String(body.userId || '')
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (actionType === 'FORCE_PASSWORD_CHANGE') {
      const result = await forceManagedUserPasswordChange({
        actorUserId: admin.id,
        actorInstitutionId: admin.institutionId,
        userId: String(body.userId || '')
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (actionType === 'UNLOCK_USER') {
      const result = await unlockManagedUser({
        actorUserId: admin.id,
        actorInstitutionId: admin.institutionId,
        userId: String(body.userId || '')
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (!isUserRole(body.role)) throw new Error('AUTH_ROLE_INVALID');

    const user = await createManagedUser({
      actorUserId: admin.id,
      actorInstitutionId: admin.institutionId,
      name: String(body.name || ''),
      email: String(body.email || ''),
      password: String(body.password || ''),
      role: body.role,
      department: typeof body.department === 'string' ? body.department : null,
      orgUnitId: typeof body.orgUnitId === 'string' ? body.orgUnitId : null
    });

    return NextResponse.json(
      { user },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.userId) throw new Error('USER_NOT_FOUND');
    if (body.role !== undefined && !isUserRole(body.role)) throw new Error('AUTH_ROLE_INVALID');

    const user = await updateManagedUser({
      actorUserId: admin.id,
      actorInstitutionId: admin.institutionId,
      userId: String(body.userId),
      role: body.role,
      department: body.department === undefined ? undefined : String(body.department || ''),
      active: body.active === undefined ? undefined : Boolean(body.active)
    });

    return NextResponse.json(
      { user },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
