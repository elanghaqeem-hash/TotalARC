'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  KeyRound,
  Layers,
  LockKeyhole,
  Mail,
  Network,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  UserPlus
} from 'lucide-react';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function bytesToBase64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

type LoginMfaState = {
  required: boolean;
  setupRequired: boolean;
  challengeId: string;
  challengeToken: string;
  expiresAt: string;
  methods: Array<'TOTP' | 'PASSKEY' | 'EMAIL_OTP' | 'SSO_MFA'>;
};

const workflowSteps = [
  { label: 'Institusi', Icon: Building2 },
  { label: 'Struktur Organisasi', Icon: Network },
  { label: 'Business Process', Icon: FileText },
  { label: 'RCM', Icon: ShieldCheck },
  { label: 'Assessment & Testing', Icon: ClipboardCheck },
  { label: 'Remediation', Icon: Settings2 },
  { label: 'Monitoring & Reporting', Icon: BarChart3 }
];

function TotalArcCarousel({ compact = false }: { compact?: boolean }) {
  const [activeSlide, setActiveSlide] = useState(1);

  const goToSlide = (index: number) => {
    setActiveSlide((index + 3) % 3);
  };

  return (
    <div className={compact ? 'mt-8' : 'mt-7'}>
      <div
        className={
          compact
            ? 'relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white'
            : 'relative overflow-hidden rounded-3xl border border-sky-300/20 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] xl:p-6'
        }
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(56,189,248,0.13),transparent_34%),radial-gradient(circle_at_15%_90%,rgba(14,165,233,0.08),transparent_34%)]" />

        <button
          type="button"
          onClick={() => goToSlide(activeSlide - 1)}
          aria-label="Slide sebelumnya"
          className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-sky-300/20 bg-slate-950/80 p-2 text-sky-200 transition hover:border-sky-300/40 hover:bg-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => goToSlide(activeSlide + 1)}
          aria-label="Slide berikutnya"
          className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-sky-300/20 bg-slate-950/80 p-2 text-sky-200 transition hover:border-sky-300/40 hover:bg-slate-900"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className={compact ? 'relative z-10 min-h-[260px] px-8' : 'relative z-10 min-h-[286px] px-8 xl:min-h-[300px]'}>
          {activeSlide === 0 && (
            <div className="flex h-full min-h-[260px] flex-col justify-between py-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">01 · Overview</div>
                <h3 className={compact ? 'mt-3 text-xl font-black' : 'mt-3 text-2xl font-black tracking-tight'}>
                  Apa itu Total ARC?
                </h3>
                <p className="mt-3 max-w-xl text-xs leading-6 text-slate-300 xl:text-sm">
                  Satu platform terintegrasi untuk menghubungkan proses, risiko, kontrol, testing, remediation,
                  monitoring, dan pelaporan dalam satu sumber data.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {['BPM & RCM', 'ICOFR & RCSA', 'CSA · ToD · ToE', 'CCM & Reporting'].map(item => (
                  <div
                    key={item}
                    className="rounded-xl border border-sky-300/15 bg-sky-400/[0.06] px-3 py-3 text-center text-[10px] font-bold text-sky-100"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="rounded-xl bg-sky-400/10 p-3 text-sky-300">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xs font-black text-white">Integrated Modules</div>
                  <div className="mt-1 text-[10px] leading-5 text-slate-400">
                    BPM, RCM, ICOFR, RCSA, CSA, ToD, ToE, Remediation, MAP, dan CCM.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSlide === 1 && (
            <div className="py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">02 · Connected Workflow</div>
              <h3 className={compact ? 'mt-3 text-xl font-black' : 'mt-3 text-2xl font-black tracking-tight'}>
                Alur Kerja Total ARC
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Data dibentuk sekali lalu digunakan lintas modul tanpa input ulang.
              </p>

              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {workflowSteps.map(({ label, Icon }, index) => (
                  <div key={label} className="relative">
                    <div className="flex min-h-[84px] flex-col items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/[0.07] px-1.5 py-2 text-center">
                      <Icon className="h-5 w-5 text-sky-300" />
                      <div className="mt-2 text-[8px] font-bold leading-3 text-slate-200 xl:text-[9px]">{label}</div>
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <div className="absolute -right-2 top-8 z-10 hidden text-[10px] text-sky-300 sm:block">→</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] px-4 py-3 text-center text-[10px] font-semibold leading-5 text-sky-100">
                Institusi → Struktur Organisasi → Business Process → RCM → Assessment & Testing → Remediation → Monitoring & Reporting
              </div>
            </div>
          )}

          {activeSlide === 2 && (
            <div className="flex h-full min-h-[260px] flex-col justify-between py-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">03 · Business Value</div>
                <h3 className={compact ? 'mt-3 text-xl font-black' : 'mt-3 text-2xl font-black tracking-tight'}>
                  Manfaat Utama
                </h3>
              </div>

              <div className="mt-5 grid gap-3">
                {[
                  'Satu sumber data untuk proses, risiko, dan kontrol',
                  'Workflow terhubung lintas fungsi dan assurance',
                  'Monitoring berkelanjutan atas testing dan remediation',
                  'Pelaporan manajemen lebih cepat dan konsisten'
                ].map(item => (
                  <div key={item} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                    <span className="text-[11px] leading-5 text-slate-300">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-300/20 bg-gradient-to-r from-sky-400/10 to-transparent p-4">
                <BarChart3 className="h-7 w-7 text-sky-300" />
                <div>
                  <div className="text-xs font-black">Actionable Reporting</div>
                  <div className="mt-1 text-[10px] leading-5 text-slate-400">
                    Dashboard, monitoring, remediation, dan management reporting.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative z-10 mt-3 flex items-center justify-center gap-2">
          {[0, 1, 2].map(index => (
            <button
              key={index}
              type="button"
              onClick={() => goToSlide(index)}
              aria-label={`Buka slide ${index + 1}`}
              className={`h-2 rounded-full transition-all ${
                activeSlide === index ? 'w-6 bg-sky-300' : 'w-2 bg-slate-600 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <Layers className="h-4 w-4 text-sky-300" />
            <div className="mt-2 text-[10px] font-black text-white">Integrated Modules</div>
            <div className="mt-1 text-[9px] leading-4 text-slate-400">Satu data untuk berbagai modul GRC.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <Share2 className="h-4 w-4 text-sky-300" />
            <div className="mt-2 text-[10px] font-black text-white">Connected Workflow</div>
            <div className="mt-1 text-[9px] leading-4 text-slate-400">Input sekali, digunakan lintas proses.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <BarChart3 className="h-4 w-4 text-sky-300" />
            <div className="mt-2 text-[10px] font-black text-white">Actionable Reporting</div>
            <div className="mt-1 text-[9px] leading-4 text-slate-400">Monitoring dan reporting yang terhubung.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const [nextPath, setNextPath] = useState('/');
  const [mfa, setMfa] = useState<LoginMfaState | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMode, setMfaMode] = useState<'TOTP' | 'EMAIL_OTP' | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaMessage, setMfaMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeNextPath(params.get('next')));
    setConfigurationRequired(params.get('configuration') === 'required');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Login tidak dapat diproses.');
      }

      if (payload?.mfaRequired && payload?.mfa) {
        setMfa(payload.mfa as LoginMfaState);
        setMfaCode('');
        setMfaMode(null);
        setTotpSetup(null);
        setMfaMessage(
          payload.mfa.setupRequired
            ? 'MFA wajib untuk role ini. Daftarkan aplikasi Authenticator atau Passkey sebelum sesi dibuat.'
            : 'Password benar. Selesaikan verifikasi MFA untuk membuat sesi Total ARC.'
        );
        return;
      }

      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login tidak dapat diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  const mfaRequest = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!mfa) throw new Error('Challenge MFA tidak tersedia.');
    const response = await fetch('/api/auth/mfa', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        challengeId: mfa.challengeId,
        challengeToken: mfa.challengeToken,
        ...extra
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Verifikasi MFA gagal.');
    return payload;
  };

  const beginTotpSetup = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = await mfaRequest('BEGIN_TOTP_ENROLLMENT');
      setTotpSetup({ secret: payload.secret, otpauthUri: payload.otpauthUri });
      setMfaMode('TOTP');
      setMfaMessage('Tambahkan secret berikut ke Google/Microsoft Authenticator atau aplikasi TOTP lain, lalu masukkan kode 6 digit.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup TOTP gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    if (!mfaMode || !mfaCode.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const action =
        mfaMode === 'TOTP'
          ? (mfa?.setupRequired ? 'CONFIRM_TOTP_ENROLLMENT' : 'VERIFY_TOTP')
          : 'VERIFY_EMAIL_OTP';
      await mfaRequest(action, { code: mfaCode });
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verifikasi MFA gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendEmailCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = await mfaRequest('SEND_EMAIL_OTP');
      setMfaMode('EMAIL_OTP');
      setMfaMessage('Kode OTP telah dikirim ke ' + (payload.maskedEmail || 'email terdaftar') + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email OTP gagal dikirim.');
    } finally {
      setSubmitting(false);
    }
  };

  const usePasskey = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setError('Browser/perangkat ini belum mendukung Passkey/WebAuthn.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (mfa?.setupRequired) {
        const payload = await mfaRequest('BEGIN_PASSKEY_ENROLLMENT');
        const options = payload.publicKey;
        const credential = (await navigator.credentials.create({
          publicKey: {
            ...options,
            challenge: base64UrlToBytes(options.challenge),
            user: {
              ...options.user,
              id: base64UrlToBytes(options.user.id)
            }
          }
        })) as PublicKeyCredential | null;

        if (!credential) throw new Error('Pendaftaran passkey dibatalkan.');
        const response = credential.response as AuthenticatorAttestationResponse & {
          getPublicKey?: () => ArrayBuffer | null;
          getPublicKeyAlgorithm?: () => number;
        };
        const publicKey = response.getPublicKey?.();
        const algorithm = response.getPublicKeyAlgorithm?.();
        if (!publicKey || typeof algorithm !== 'number') {
          throw new Error('Browser tidak dapat mengekspor public key passkey. Gunakan browser versi terbaru.');
        }

        await mfaRequest('CONFIRM_PASSKEY_ENROLLMENT', {
          credentialId: bytesToBase64Url(credential.rawId),
          publicKeySpki: bytesToBase64Url(publicKey),
          algorithm,
          clientDataJSON: bytesToBase64Url(response.clientDataJSON)
        });
      } else {
        const payload = await mfaRequest('BEGIN_PASSKEY_AUTHENTICATION');
        const options = payload.publicKey;
        const credential = (await navigator.credentials.get({
          publicKey: {
            ...options,
            challenge: base64UrlToBytes(options.challenge),
            allowCredentials: (options.allowCredentials || []).map((item: any) => ({
              ...item,
              id: base64UrlToBytes(item.id)
            }))
          }
        })) as PublicKeyCredential | null;

        if (!credential) throw new Error('Verifikasi passkey dibatalkan.');
        const response = credential.response as AuthenticatorAssertionResponse;
        await mfaRequest('VERIFY_PASSKEY', {
          credentialId: bytesToBase64Url(credential.rawId),
          clientDataJSON: bytesToBase64Url(response.clientDataJSON),
          authenticatorData: bytesToBase64Url(response.authenticatorData),
          signature: bytesToBase64Url(response.signature)
        });
      }

      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey tidak dapat diverifikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifySso = async () => {
    setSubmitting(true);
    setError('');
    try {
      await mfaRequest('VERIFY_SSO_MFA');
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO MFA tidak dapat diverifikasi.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-44px_rgba(15,23,42,0.45)] lg:grid-cols-[1.18fr_0.82fr]">
          <section className="hidden min-h-[720px] flex-col bg-slate-950 p-8 text-white lg:flex xl:p-10">
            <img
              src="/brand/total-arc-logo.svg"
              alt="Total ARC"
              className="h-14 w-auto max-w-[190px] rounded-xl bg-white px-3 py-2 object-contain"
            />

            <div className="mt-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-sky-200">
                <ShieldCheck className="h-4 w-4" />
                About Total ARC
              </div>
              <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-tight xl:text-4xl">
                Total ARC adalah platform terintegrasi
                <span className="block text-sky-300">untuk governance, risk, dan control.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-xs leading-6 text-slate-300 xl:text-sm xl:leading-7">
                Total ARC membantu institusi mendaftarkan entitas, menyusun struktur organisasi, memetakan proses
                bisnis, membangun Risk Control Matrix, serta menjalankan monitoring dan assurance secara terhubung
                dalam satu sistem.
              </p>
            </div>

            <TotalArcCarousel />
          </section>

          <section className="flex min-h-[620px] items-center p-5 sm:p-8 lg:min-h-[720px] lg:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <img
                  src="/brand/total-arc-logo.svg"
                  alt="Total ARC"
                  className="h-14 w-auto max-w-[180px] object-contain"
                />
              </div>

              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-600">
                Total ARC Secure Access
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {mfa ? 'Verifikasi MFA' : 'Sign in'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {mfa
                  ? 'Sesi belum dibuat. Selesaikan faktor kedua untuk melanjutkan ke Total ARC.'
                  : 'Gunakan credential akun yang diberikan administrator institusi Anda.'}
              </p>

              {configurationRequired && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Authentication deployment belum lengkap. Administrator sistem perlu mengatur secret authentication pada environment.
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
                  {error}
                </div>
              )}

              {!mfa ? (
                <form onSubmit={submit} className="mt-7 space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-slate-700">Email</span>
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-50">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        type="email"
                        autoComplete="username"
                        required
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="nama@perusahaan.co.id"
                        className="h-12 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-slate-700">Password</span>
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-50">
                      <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        className="h-12 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(current => !current)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    )}
                    {submitting ? 'Signing in…' : 'Sign in to Total ARC'}
                  </button>

                  <Link
                    href="/admin/users"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                  >
                    <UserPlus className="h-4 w-4" />
                    Admin Setup · Daftarkan User
                  </Link>
                </form>
              ) : (
                <div className="mt-7 space-y-4">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">
                    <div className="font-black">
                      {mfa.setupRequired ? 'Pendaftaran MFA Wajib' : 'Multi-Factor Authentication'}
                    </div>
                    <div className="mt-1">{mfaMessage}</div>
                  </div>

                  {mfa.setupRequired ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void beginTotpSetup()}
                        disabled={submitting}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
                      >
                        <Smartphone className="h-5 w-5 text-sky-600" />
                        <div className="mt-2 text-xs font-black text-slate-900">Authenticator / TOTP</div>
                        <div className="mt-1 text-[10px] leading-4 text-slate-500">
                          Google Authenticator, Microsoft Authenticator, Authy, atau aplikasi TOTP lain.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void usePasskey()}
                        disabled={submitting}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <Fingerprint className="h-5 w-5 text-emerald-600" />
                        <div className="mt-2 text-xs font-black text-slate-900">WebAuthn / Passkey</div>
                        <div className="mt-1 text-[10px] leading-4 text-slate-500">
                          Gunakan biometrik, PIN perangkat, atau security key yang didukung browser.
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {mfa.methods.includes('TOTP') && (
                        <button
                          type="button"
                          onClick={() => {
                            setMfaMode('TOTP');
                            setMfaCode('');
                            setMfaMessage('Masukkan kode 6 digit dari aplikasi Authenticator.');
                          }}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-300 hover:bg-sky-50"
                        >
                          <Smartphone className="h-5 w-5 text-sky-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900">Authenticator / TOTP</div>
                            <div className="text-[10px] text-slate-500">Kode berubah setiap 30 detik.</div>
                          </div>
                        </button>
                      )}
                      {mfa.methods.includes('PASSKEY') && (
                        <button
                          type="button"
                          onClick={() => void usePasskey()}
                          disabled={submitting}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <Fingerprint className="h-5 w-5 text-emerald-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900">WebAuthn / Passkey</div>
                            <div className="text-[10px] text-slate-500">Biometrik, PIN perangkat, atau security key.</div>
                          </div>
                        </button>
                      )}
                      {mfa.methods.includes('EMAIL_OTP') && (
                        <button
                          type="button"
                          onClick={() => void sendEmailCode()}
                          disabled={submitting}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
                        >
                          <Mail className="h-5 w-5 text-violet-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900">Email OTP</div>
                            <div className="text-[10px] text-slate-500">Kode satu kali ke email akun terdaftar.</div>
                          </div>
                        </button>
                      )}
                      {mfa.methods.includes('SSO_MFA') && (
                        <button
                          type="button"
                          onClick={() => void verifySso()}
                          disabled={submitting}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <ShieldCheck className="h-5 w-5 text-indigo-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900">SSO MFA</div>
                            <div className="text-[10px] text-slate-500">Gunakan assurance MFA dari gateway SSO institusi.</div>
                          </div>
                        </button>
                      )}
                    </div>
                  )}

                  {totpSetup && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                        <KeyRound className="h-4 w-4" />
                        Secret Authenticator
                      </div>
                      <div className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-900 ring-1 ring-slate-200">
                        {totpSetup.secret}
                      </div>
                      <div className="mt-2 text-[9px] leading-4 text-slate-500">
                        Tambahkan secara manual sebagai akun <strong>Total ARC</strong>. Secret hanya ditampilkan pada proses setup ini.
                      </div>
                    </div>
                  )}

                  {mfaMode && (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-700">
                        Kode verifikasi 6 digit
                        <input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={mfaCode}
                          onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-xl font-black tracking-[0.35em] text-slate-950 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void verifyCode()}
                        disabled={submitting || mfaCode.length !== 6}
                        className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        {submitting ? 'Memverifikasi…' : 'Verifikasi & Masuk'}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMfa(null);
                      setMfaMode(null);
                      setMfaCode('');
                      setTotpSetup(null);
                      setPassword('');
                      setMfaMessage('');
                    }}
                    className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-800"
                  >
                    Kembali ke login
                  </button>
                </div>
              )}

              <div className="lg:hidden">
                <TotalArcCarousel compact />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
