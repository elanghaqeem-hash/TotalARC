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
  Layers,
  LockKeyhole,
  Mail,
  Network,
  Settings2,
  Share2,
  ShieldCheck,
  UserPlus
} from 'lucide-react';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

const workflowSteps = [
  { label: 'Institusi', Icon: Building2 },
  { label: 'Struktur Organisasi', Icon: Network },
  { label: 'Proses Bisnis', Icon: FileText },
  { label: 'RCM', Icon: ShieldCheck },
  { label: 'Asesmen & Pengujian', Icon: ClipboardCheck },
  { label: 'Remediasi', Icon: Settings2 },
  { label: 'Pemantauan & Pelaporan', Icon: BarChart3 }
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
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">01 · Ringkasan</div>
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
                  <div className="text-xs font-black text-white">Modul Terintegrasi</div>
                  <div className="mt-1 text-[10px] leading-5 text-slate-400">
                    BPM, RCM, ICOFR, RCSA, CSA, ToD, ToE, Remediation, MAP, dan CCM.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSlide === 1 && (
            <div className="py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">02 · Alur Kerja Terhubung</div>
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
                Institusi → Struktur Organisasi → Proses Bisnis → RCM → Asesmen & Pengujian → Remediasi → Pemantauan & Pelaporan
              </div>
            </div>
          )}

          {activeSlide === 2 && (
            <div className="flex h-full min-h-[260px] flex-col justify-between py-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">03 · Nilai Bisnis</div>
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
                  <div className="text-xs font-black">Pelaporan yang Dapat Ditindaklanjuti</div>
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
            <div className="mt-2 text-[10px] font-black text-white">Modul Terintegrasi</div>
            <div className="mt-1 text-[9px] leading-4 text-slate-400">Satu data untuk berbagai modul GRC.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <Share2 className="h-4 w-4 text-sky-300" />
            <div className="mt-2 text-[10px] font-black text-white">Alur Kerja Terhubung</div>
            <div className="mt-1 text-[9px] leading-4 text-slate-400">Input sekali, digunakan lintas proses.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <BarChart3 className="h-4 w-4 text-sky-300" />
            <div className="mt-2 text-[10px] font-black text-white">Pelaporan yang Dapat Ditindaklanjuti</div>
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

      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login tidak dapat diproses.');
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
                Tentang Total ARC
              </div>
              <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-tight xl:text-4xl">
                Total ARC adalah platform terintegrasi
                <span className="block text-sky-300">untuk tata kelola, risiko, dan kontrol.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-xs leading-6 text-slate-300 xl:text-sm xl:leading-7">
                Total ARC membantu institusi mendaftarkan entitas, menyusun struktur organisasi, memetakan proses
                bisnis, membangun Matriks Risiko dan Kontrol, serta menjalankan pemantauan dan penjaminan secara terhubung
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
                Akses Aman Total ARC
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Masuk</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Gunakan kredensial akun yang diberikan administrator institusi Anda.
              </p>

              {configurationRequired && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Konfigurasi autentikasi deployment belum lengkap. Administrator sistem perlu mengatur secret autentikasi pada environment.
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
                  {error}
                </div>
              )}

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
                  <span className="mb-2 block text-xs font-black text-slate-700">Kata Sandi</span>
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
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
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
                  {submitting ? 'Sedang masuk…' : 'Masuk ke Total ARC'}
                </button>

                <Link
                  href="/admin/users"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                >
                  <UserPlus className="h-4 w-4" />
                  Penyiapan Admin · Daftarkan Pengguna
                </Link>
              </form>

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
