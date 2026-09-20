import { NextResponse } from 'next/server';
import {
  changeOwnPassword,
  getAuthenticatedProfile,
  updateOwnProfile
} from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

function tokenFromRequest(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function profileError(error: unknown) {
  const code = error instanceof Error ? error.message : 'PROFILE_ERROR';
  const mapping: Record<string, { status: number; error: string }> = {
    USER_REQUIRED_FIELDS: { status: 400, error: 'Nama pengguna wajib diisi.' },
    USER_NOT_FOUND: { status: 404, error: 'User tidak ditemukan atau tidak aktif.' },
    CURRENT_PASSWORD_INVALID: { status: 400, error: 'Password saat ini tidak sesuai.' },
    PASSWORD_POLICY: {
      status: 400,
      error: 'Password baru harus 12–128 karakter dan mengandung huruf besar, huruf kecil, angka, serta simbol. Password umum/default tidak diperbolehkan.'
    },
    PASSWORD_REUSE: {
      status: 409,
      error: 'Password baru sama dengan password saat ini atau salah satu dari lima password terakhir.'
    }
  };
  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json(
      { error: mapped.error, code },
      { status: mapped.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  console.error('Profile security action failed:', error);
  return NextResponse.json(
    { error: 'Profile tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function authenticatedProfile(request: Request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  return getAuthenticatedProfile(token);
}

export async function PATCH(request: Request) {
  try {
    const profile = await authenticatedProfile(request);
    if (!profile) {
      return NextResponse.json(
        { error: 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const updated = await updateOwnProfile({
      userId: profile.id,
      name: String(body.name || '')
    });

    return NextResponse.json(
      { user: updated },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return profileError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await authenticatedProfile(request);
    if (!profile) {
      return NextResponse.json(
        { error: 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    if (body.actionType !== 'CHANGE_PASSWORD') {
      return NextResponse.json(
        { error: 'Unsupported profile action.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const result = await changeOwnPassword({
      userId: profile.id,
      currentPassword: String(body.currentPassword || ''),
      newPassword: String(body.newPassword || '')
    });

    const response = NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0
    });
    return response;
  } catch (error) {
    return profileError(error);
  }
}
