import { NextResponse } from 'next/server';
import {
  beginPasskeyAuthentication,
  beginPasskeyEnrollment,
  beginTotpEnrollment,
  challengeUser,
  confirmPasskeyEnrollment,
  confirmTotpEnrollment,
  sendEmailOtp,
  verifyEmailOtp,
  verifyPasskeyAuthentication,
  verifySsoMfaGateway,
  verifyTotpLogin
} from '@/lib/auth-mfa';
import {
  completeMfaLogin,
  getAuthProfileById
} from '@/lib/auth';
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_SECONDS
} from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

function text(value: unknown, max = 4096) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function requestIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    MFA_CHALLENGE_INVALID: 'Challenge MFA tidak valid. Silakan login kembali.',
    MFA_CHALLENGE_CONSUMED: 'Challenge MFA sudah digunakan. Silakan login kembali.',
    MFA_CHALLENGE_EXPIRED: 'Challenge MFA telah kedaluwarsa. Silakan login kembali.',
    MFA_CHALLENGE_ATTEMPTS_EXCEEDED: 'Batas percobaan MFA telah terlampaui. Silakan login kembali.',
    MFA_CODE_INVALID: 'Kode verifikasi tidak sesuai.',
    MFA_CODE_EXPIRED: 'Kode verifikasi telah kedaluwarsa.',
    MFA_METHOD_NOT_ENROLLED: 'Metode MFA belum terdaftar untuk akun ini.',
    MFA_TOTP_SETUP_NOT_STARTED: 'Setup authenticator belum dimulai.',
    MFA_EMAIL_NOT_CONFIGURED: 'Email OTP belum dikonfigurasi oleh administrator sistem.',
    MFA_EMAIL_DELIVERY_FAILED: 'Kode email OTP tidak dapat dikirim.',
    MFA_ENROLLMENT_NOT_ALLOWED: 'Pendaftaran MFA tidak diizinkan pada challenge ini.',
    MFA_PASSKEY_SETUP_NOT_STARTED: 'Pendaftaran passkey belum dimulai.',
    MFA_PASSKEY_ALGORITHM_UNSUPPORTED: 'Algoritma passkey tidak didukung.',
    MFA_PASSKEY_CLIENT_DATA_INVALID: 'Data passkey tidak valid.',
    MFA_PASSKEY_CHALLENGE_INVALID: 'Challenge passkey tidak valid.',
    MFA_PASSKEY_ORIGIN_INVALID: 'Origin passkey tidak valid.',
    MFA_PASSKEY_RPID_INVALID: 'Relying Party ID passkey tidak valid.',
    MFA_PASSKEY_USER_PRESENCE_REQUIRED: 'Verifikasi pengguna pada passkey diperlukan.',
    MFA_PASSKEY_SIGNATURE_INVALID: 'Verifikasi signature passkey gagal.',
    MFA_PASSKEY_COUNTER_REPLAY: 'Passkey ditolak karena indikasi replay/counter tidak valid.',
    MFA_SSO_NOT_CONFIGURED: 'SSO MFA belum dikonfigurasi.',
    MFA_SSO_ASSERTION_MISSING: 'Assertion SSO MFA tidak tersedia.',
    MFA_SSO_EMAIL_MISMATCH: 'Identitas SSO tidak sesuai dengan akun Total ARC.',
    MFA_SSO_ASSERTION_EXPIRED: 'Assertion SSO MFA telah kedaluwarsa.',
    MFA_SSO_SIGNATURE_INVALID: 'Signature SSO MFA tidak valid.',
    AUTH_MFA_SECRET_INVALID: 'Secret keamanan MFA belum dikonfigurasi dengan benar.',
    ACCOUNT_DISABLED: 'Akun tidak aktif.'
  };
  return messages[code] || 'Verifikasi MFA tidak dapat diproses.';
}

function errorStatus(code: string) {
  if (code.includes('NOT_CONFIGURED') || code === 'AUTH_MFA_SECRET_INVALID') return 503;
  if (code === 'ACCOUNT_DISABLED') return 403;
  if (
    code.includes('INVALID') ||
    code.includes('EXPIRED') ||
    code.includes('EXCEEDED') ||
    code.includes('REPLAY') ||
    code.includes('MISSING') ||
    code.includes('NOT_ENROLLED') ||
    code.includes('NOT_ALLOWED')
  ) return 401;
  return 400;
}

function sessionResponse(payload: {
  profile: unknown;
  token: string;
  method: string;
}) {
  const response = NextResponse.json({
    success: true,
    user: payload.profile,
    mfaVerified: true,
    method: payload.method
  });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: payload.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_SECONDS
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function finalize(request: Request, input: {
  userId: string;
  method: 'TOTP' | 'PASSKEY' | 'EMAIL_OTP' | 'SSO_MFA';
  challengeId: string;
}) {
  const result = await completeMfaLogin({
    userId: input.userId,
    method: input.method,
    challengeId: input.challengeId,
    ipAddress: requestIp(request),
    userAgent: request.headers.get('user-agent')
  });
  return sessionResponse({
    profile: result.profile,
    token: result.token,
    method: input.method
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action, 80).toUpperCase();
    const challengeId = text(body.challengeId, 120);
    const challengeToken = text(body.challengeToken, 512);

    if (!challengeId || !challengeToken) {
      return NextResponse.json(
        { error: 'Challenge MFA diperlukan.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const challenge = await challengeUser({ challengeId, challengeToken });
    const profile = await getAuthProfileById(challenge.userId);

    if (action === 'BEGIN_TOTP_ENROLLMENT') {
      const setup = await beginTotpEnrollment({
        challengeId,
        challengeToken,
        accountLabel: profile.email
      });
      return NextResponse.json(setup, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'CONFIRM_TOTP_ENROLLMENT') {
      const verified = await confirmTotpEnrollment({
        challengeId,
        challengeToken,
        code: text(body.code, 20)
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    if (action === 'VERIFY_TOTP') {
      const verified = await verifyTotpLogin({
        challengeId,
        challengeToken,
        code: text(body.code, 20)
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    if (action === 'SEND_EMAIL_OTP') {
      const result = await sendEmailOtp({
        challengeId,
        challengeToken,
        email: profile.email
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'VERIFY_EMAIL_OTP') {
      const verified = await verifyEmailOtp({
        challengeId,
        challengeToken,
        code: text(body.code, 20)
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    if (action === 'BEGIN_PASSKEY_ENROLLMENT') {
      const publicKey = await beginPasskeyEnrollment({
        request,
        challengeId,
        challengeToken,
        userId: profile.id,
        userName: profile.email,
        displayName: profile.name
      });
      return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'CONFIRM_PASSKEY_ENROLLMENT') {
      const verified = await confirmPasskeyEnrollment({
        request,
        challengeId,
        challengeToken,
        credentialId: text(body.credentialId, 2048),
        publicKeySpki: text(body.publicKeySpki, 8192),
        algorithm: Number(body.algorithm),
        clientDataJSON: text(body.clientDataJSON, 8192)
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    if (action === 'BEGIN_PASSKEY_AUTHENTICATION') {
      const publicKey = await beginPasskeyAuthentication({
        request,
        challengeId,
        challengeToken
      });
      return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'VERIFY_PASSKEY') {
      const verified = await verifyPasskeyAuthentication({
        request,
        challengeId,
        challengeToken,
        credentialId: text(body.credentialId, 2048),
        clientDataJSON: text(body.clientDataJSON, 8192),
        authenticatorData: text(body.authenticatorData, 8192),
        signature: text(body.signature, 8192)
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    if (action === 'VERIFY_SSO_MFA') {
      const verified = await verifySsoMfaGateway({
        request,
        challengeId,
        challengeToken,
        email: profile.email
      });
      return finalize(request, {
        userId: verified.userId,
        method: verified.method,
        challengeId
      });
    }

    return NextResponse.json(
      { error: 'Aksi MFA tidak didukung.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'MFA_ERROR';
    if (errorStatus(code) >= 500) console.error('Total ARC MFA error:', code);
    return NextResponse.json(
      { error: errorMessage(code), code },
      {
        status: errorStatus(code),
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  }
}
