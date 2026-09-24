'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { canAccessPage } from '@/lib/access-control';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Database,
  FileArchive,
  FileCheck,
  FileSpreadsheet,
  FolderTree,
  Layers,
  Link2,
  LockKeyhole,
  LogOut,
  Languages,
  Menu,
  Shield,
  Sparkles,
  Target,
  UserRound,
  Users,
  Workflow,
  X
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  title: string;
  subtitle: string;
  items: NavItem[];
}

type UiLanguage = 'id' | 'en';

const LANGUAGE_STORAGE_KEY = 'total-arc-language';

const englishGroupCopy: Record<string, { title: string; subtitle: string }> = {
  KELOLA: { title: 'MANAGE', subtitle: 'Define & govern' },
  ASESMEN: { title: 'ASSURE', subtitle: 'Assess & validate' },
  PANTAU: { title: 'MONITOR', subtitle: 'Monitor & respond' }
};

const englishNavLabels: Record<string, string> = {
  '/': 'Core Dashboard',
  '/onboarding': 'Institution Onboarding',
  '/organization': 'Organization Structure',
  '/admin/users': 'User & Role Management',
  '/admin/security': 'Authentication Security',
  '/admin/data-hub': 'Data Integration Hub',
  '/processes': 'Process Architecture (BPM)',
  '/risks': 'Risk Universe & Heatmap',
  '/controls': 'Single Control Library',
  '/rcm': 'Relational RCM Workspace',
  '/evidence': 'Enterprise Evidence Repository',
  '/rcsa': 'RCSA & CSA Workspace',
  '/icofr': 'ICOFR Program Hub',
  '/icofr/scoping': 'ICOFR Scoping & Materiality',
  '/icofr/accounts': 'Accounts, Disclosures & Assertions',
  '/icofr/traceability': 'ICOFR Traceability Matrix',
  '/icofr/coverage': 'ICOFR Coverage & Gap Analytics',
  '/icofr/elc': 'Entity-Level Controls (ELC)',
  '/icofr/plc': 'Process-Level Controls (PLC)',
  '/icofr/itgc': 'IT General Controls (ITGC)',
  '/icofr/itac': 'IT Application Controls (ITAC)',
  '/icofr/information': 'IPE & EUC Register',
  '/icofr/testing-plan': 'ICOFR Testing Plan & Cycle',
  '/icofr/smart-testing': 'ICOFR Smart Testing Strategy',
  '/icofr/sampling-evidence': 'ICOFR Sampling & Evidence',
  '/icofr/workpaper-review': 'ICOFR Workpaper Review',
  '/tod': 'Walkthrough & ToD',
  '/toe': 'ToE Testing & Samples',
  '/icofr/deficiencies': 'ICOFR Deficiency Evaluation',
  '/remediation': 'Remediation & MAP',
  '/health': 'Control Health Cockpit',
  '/ccm': 'Continuous Monitoring (CCM)',
  '/certification': 'ICOFR Certification & Close',
  '/icofr/reporting': 'ICOFR Executive Reporting',
  '/icofr/period-close': 'ICOFR Period Close & Archive',
  '/icofr/roll-forward': 'ICOFR Roll-Forward',
  '/calendar': 'Assurance Calendar',
  '/tasks': 'Task Center & Escalation',
  '/reports': 'Analytics'
};

const shellCopy = {
  id: {
    institution: 'Institusi',
    activeInstitution: 'Institusi aktif',
    selectInstitution: 'Pilih institusi',
    profile: 'Profil Saya',
    language: 'Bahasa',
    indonesian: 'Indonesia',
    english: 'English',
    security: 'Administrasi Keamanan',
    signOut: 'Keluar',
    navigation: 'Navigasi',
    more: 'Lainnya'
  },
  en: {
    institution: 'Institution',
    activeInstitution: 'Active institution',
    selectInstitution: 'Select institution',
    profile: 'My Profile',
    language: 'Language',
    indonesian: 'Indonesia',
    english: 'English',
    security: 'Security Administration',
    signOut: 'Sign Out',
    navigation: 'Navigation',
    more: 'More'
  }
} as const;

const warmedRoutes = new Set<string>();

const navGroups: NavGroup[] = [
  {
    title: 'KELOLA',
    subtitle: 'Definisikan & kelola',
    items: [
      { name: 'Dasbor Utama', href: '/', icon: Activity },
      { name: 'Registrasi Institusi', href: '/onboarding', icon: Building2 },
      { name: 'Struktur Organisasi', href: '/organization', icon: FolderTree },
      { name: 'Manajemen Pengguna & Peran', href: '/admin/users', icon: Users, badge: 'RBAC' },
      { name: 'Keamanan Autentikasi', href: '/admin/security', icon: LockKeyhole, badge: 'AUTH' },
      { name: 'Pusat Integrasi Data', href: '/admin/data-hub', icon: Database, badge: 'D1' },
      { name: 'Arsitektur Proses (BPM)', href: '/processes', icon: Layers, badge: 'L0–L5' },
      { name: 'Semesta Risiko & Peta Risiko', href: '/risks', icon: AlertTriangle },
      { name: 'Pustaka Kontrol Terpadu', href: '/controls', icon: Shield },
      { name: 'Ruang Kerja RCM Relasional', href: '/rcm', icon: FileSpreadsheet },
      { name: 'Repositori Bukti Perusahaan', href: '/evidence', icon: FileArchive, badge: 'FILES' }
    ]
  },
  {
    title: 'ASESMEN',
    subtitle: 'Uji & validasi',
    items: [
      { name: 'Ruang Kerja RCSA & CSA', href: '/rcsa', icon: ClipboardCheck },
      { name: 'Pusat Program ICOFR', href: '/icofr', icon: FileCheck },
      { name: 'Ruang Lingkup & Materialitas ICOFR', href: '/icofr/scoping', icon: Target, badge: 'OM · PM' },
      { name: 'Akun, Pengungkapan & Asersi', href: '/icofr/accounts', icon: FileSpreadsheet },
      { name: 'Matriks Ketertelusuran ICOFR', href: '/icofr/traceability', icon: Link2, badge: 'E2E' },
      { name: 'Cakupan & Analisis Gap ICOFR', href: '/icofr/coverage', icon: BarChart3, badge: 'GAP' },
      { name: 'Kontrol Tingkat Entitas (ELC)', href: '/icofr/elc', icon: Shield },
      { name: 'Kontrol Tingkat Proses (PLC)', href: '/icofr/plc', icon: ClipboardCheck },
      { name: 'Kontrol Umum TI (ITGC)', href: '/icofr/itgc', icon: Cpu },
      { name: 'Kontrol Aplikasi TI (ITAC)', href: '/icofr/itac', icon: Workflow },
      { name: 'Register IPE & EUC', href: '/icofr/information', icon: FileSpreadsheet },
      { name: 'Rencana & Siklus Pengujian ICOFR', href: '/icofr/testing-plan', icon: Calendar, badge: 'PLAN' },
      { name: 'Strategi Pengujian Cerdas ICOFR', href: '/icofr/smart-testing', icon: Sparkles, badge: 'SMART' },
      { name: 'Sampling & Bukti ICOFR', href: '/icofr/sampling-evidence', icon: FileSpreadsheet, badge: 'SAMPLE' },
      { name: 'Tinjauan Kertas Kerja ICOFR', href: '/icofr/workpaper-review', icon: ClipboardCheck, badge: 'QA' },
      { name: 'Walkthrough & ToD', href: '/tod', icon: Workflow },
      { name: 'Pengujian ToE & Sampel', href: '/toe', icon: Cpu },
      { name: 'Evaluasi Defisiensi ICOFR', href: '/icofr/deficiencies', icon: AlertTriangle },
      { name: 'Remediasi & MAP', href: '/remediation', icon: BadgeCheck }
    ]
  },
  {
    title: 'PANTAU',
    subtitle: 'Pantau & tindak lanjuti',
    items: [
      { name: 'Dasbor Kesehatan Kontrol', href: '/health', icon: Activity },
      { name: 'Pemantauan Berkelanjutan (CCM)', href: '/ccm', icon: Cpu },
      { name: 'Sertifikasi & Penutupan ICOFR', href: '/certification', icon: BadgeCheck, badge: 'SIGN' },
      { name: 'Pelaporan Eksekutif ICOFR', href: '/icofr/reporting', icon: BarChart3, badge: 'BOARD' },
      { name: 'Penutupan Periode & Arsip ICOFR', href: '/icofr/period-close', icon: FileCheck, badge: 'LOCK' },
      { name: 'ICOFR Roll-Forward', href: '/icofr/roll-forward', icon: Calendar, badge: 'NEW FY' },
      { name: 'Kalender Assurance', href: '/calendar', icon: Calendar },
      { name: 'Pusat Tugas & Eskalasi', href: '/tasks', icon: CheckSquare },
      { name: 'Analitik', href: '/reports', icon: BarChart3 }
    ]
  }
];

const mobileCandidates = [
  { label: 'Beranda', href: '/', icon: Activity },
  { label: 'Proses', href: '/processes', icon: Layers },
  { label: 'Kontrol', href: '/controls', icon: Shield },
  { label: 'ToE', href: '/toe', icon: Cpu },
  { label: 'Tugas', href: '/tasks', icon: CheckSquare },
  { label: 'Laporan', href: '/reports', icon: BarChart3 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    authenticated,
    loading,
    logout,
    institutionOptions,
    canSwitchInstitution
  } = useRole();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [institutionMenuOpen, setInstitutionMenuOpen] = useState(false);
  const [institutionSwitching, setInstitutionSwitching] = useState(false);
  const [language, setLanguage] = useState<UiLanguage>('id');

  const isLoginPage = pathname === '/login';
  const copy = shellCopy[language];

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const nextLanguage: UiLanguage = storedLanguage === 'en' ? 'en' : 'id';
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
  }, []);

  const changeLanguage = useCallback((nextLanguage: UiLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    document.cookie =
      'total_arc_language=' +
      encodeURIComponent(nextLanguage) +
      '; Path=/; Max-Age=31536000; SameSite=Lax';
    window.dispatchEvent(
      new CustomEvent('totalarc:language-change', {
        detail: { language: nextLanguage }
      })
    );
  }, []);

  const visibleNavGroups = useMemo(
    () =>
      navGroups
        .map(group => {
          const englishGroup = englishGroupCopy[group.title];
          return {
            ...group,
            title: language === 'en' && englishGroup ? englishGroup.title : group.title,
            subtitle:
              language === 'en' && englishGroup ? englishGroup.subtitle : group.subtitle,
            items: group.items
              .filter(item => canAccessPage(currentUser.role, item.href))
              .map(item => ({
                ...item,
                name:
                  language === 'en'
                    ? englishNavLabels[item.href] || item.name
                    : item.name
              }))
          };
        })
        .filter(group => group.items.length > 0),
    [currentUser.role, language]
  );

  const mobileItems = useMemo(
    () =>
      mobileCandidates
        .filter(item => canAccessPage(currentUser.role, item.href))
        .map(item => ({
          ...item,
          label:
            language === 'en'
              ? englishNavLabels[item.href] || item.label
              : item.label
        }))
        .slice(0, 4),
    [currentUser.role, language]
  );

  const prefetchRoute = useCallback(
    (href: string) => {
      if (!authenticated || !href || warmedRoutes.has(href)) return;
      if (!canAccessPage(currentUser.role, href)) return;
      warmedRoutes.add(href);
      router.prefetch(href);
    },
    [authenticated, currentUser.role, router]
  );

  useEffect(() => {
    if (isLoginPage || loading || authenticated) return;
    const target = pathname && pathname !== '/' ? '?next=' + encodeURIComponent(pathname) : '';
    router.replace('/login' + target);
  }, [authenticated, isLoginPage, loading, pathname, router]);

  useEffect(() => {
    if (!authenticated || loading || isLoginPage) return;

    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;

    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return;
    }

    const allItems = visibleNavGroups.flatMap(group => group.items);
    const currentIndex = allItems.findIndex(item => item.href === pathname);
    if (currentIndex < 0) return;

    const candidates = [
      allItems[currentIndex + 1]?.href,
      allItems[currentIndex + 2]?.href,
      allItems[currentIndex - 1]?.href
    ].filter((href): href is string => Boolean(href && href !== pathname));

    const warmNeighbors = () => {
      for (const href of candidates) prefetchRoute(href);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(warmNeighbors, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(warmNeighbors, 650);
    return () => window.clearTimeout(timer);
  }, [authenticated, isLoginPage, loading, pathname, prefetchRoute, visibleNavGroups]);

  useEffect(() => {
    const stored = window.localStorage.getItem('total-arc-sidebar-collapsed');
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('total-arc-sidebar-collapsed', String(next));
      return next;
    });
  };

  const switchInstitution = useCallback(async (institutionId: string) => {
    if (!institutionId || institutionId === currentUser.institutionId || institutionSwitching) {
      setInstitutionMenuOpen(false);
      return;
    }

    setInstitutionSwitching(true);
    try {
      const response = await fetch('/api/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ institutionId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Institusi tidak dapat diganti.');

      setInstitutionMenuOpen(false);
      window.location.assign(pathname || '/');
    } catch (error) {
      console.error('Institution switch failed:', error);
      setInstitutionSwitching(false);
    }
  }, [currentUser.institutionId, institutionSwitching, pathname]);

  const Nav = ({ mobile = false, collapsed = false }: { mobile?: boolean; collapsed?: boolean }) => (
    <div className={collapsed ? 'space-y-2' : 'space-y-4'}>
      {visibleNavGroups.map(group => (
        <section
          key={group.title}
          className={`border border-slate-200 bg-white shadow-sm transition-all duration-200 ${
            collapsed ? 'rounded-xl p-1.5' : 'rounded-2xl p-2.5'
          }`}
        >
          {!collapsed && (
            <div className="px-2.5 pb-2 pt-1">
              <div className="text-[11px] font-black tracking-[0.12em] text-slate-800">{group.title}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{group.subtitle}</div>
            </div>
          )}

          <div className={collapsed ? 'space-y-1.5' : 'space-y-1'}>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.name : undefined}
                  aria-label={collapsed ? item.name : undefined}
                  prefetch={false}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
                  onTouchStart={() => prefetchRoute(item.href)}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  className={`group flex items-center rounded-xl text-[11px] transition-all ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-2.5 py-2.5'
                  } ${
                    active
                      ? 'bg-gradient-to-r from-brand-600 to-sky-500 font-bold text-white shadow-md shadow-sky-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-white/15'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-brand-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </span>
                  {!collapsed && item.badge && (
                    <span className={`ml-2 shrink-0 text-[9px] font-bold ${active ? 'text-white/80' : 'text-slate-400'}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  if (isLoginPage) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
          Memverifikasi sesi Total ARC…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-500">
        Mengarahkan ke halaman login…
      </div>
    );
  }

  const initial = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-[1600px] items-center justify-between gap-1.5 px-2.5 sm:h-[72px] sm:gap-4 sm:px-5 lg:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:w-11 sm:rounded-xl lg:hidden"
              aria-label="Buka navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              href="/"
              prefetch={false}
              onMouseEnter={() => prefetchRoute('/')}
              onFocus={() => prefetchRoute('/')}
              className="flex min-w-0 items-center"
              aria-label="Beranda Total ARC"
            >
              <img
                src="/brand/total-arc-logo.svg"
                alt="Total ARC"
                className="h-[34px] w-auto max-w-[92px] object-contain sm:h-[48px] sm:max-w-[150px] md:max-w-[165px]"
              />
            </Link>
          </div>

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            {currentUser.role === 'Admin' && institutionOptions.length > 0 && (
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => canSwitchInstitution && setInstitutionMenuOpen(current => !current)}
                  disabled={institutionSwitching || !canSwitchInstitution}
                  className="flex h-10 max-w-[116px] min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 sm:min-h-10 sm:max-w-[220px] sm:gap-2 sm:px-3 sm:py-2"
                  aria-label="Pilih institusi aktif"
                  title="Pilih institusi aktif"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 sm:h-auto sm:w-auto sm:bg-transparent">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-600 sm:h-4 sm:w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[7px] font-bold uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-wide">
                      {copy.institution}
                    </div>
                    <div className="truncate text-[9px] font-black leading-tight text-slate-800 sm:text-[11px]">
                      {institutionOptions.find(item => item.id === currentUser.institutionId)?.name ||
                        currentUser.institutionName ||
                        copy.selectInstitution}
                    </div>
                  </div>
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 sm:h-3.5 sm:w-3.5" />
                </button>

                {institutionMenuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-[290px] max-w-[calc(100vw-20px)] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10 sm:w-[320px] sm:max-w-[calc(100vw-24px)]">
                    <div className="px-2.5 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {copy.activeInstitution}
                    </div>
                    <div className="space-y-1">
                      {institutionOptions.map(item => {
                        const active = item.id === currentUser.institutionId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void switchInstitution(item.id)}
                            disabled={institutionSwitching}
                            className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                              active
                                ? 'bg-brand-50 text-brand-800'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Building2 className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-black">{item.name}</div>
                              <div className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-400">
                                {item.legalName}
                              </div>
                            </div>
                            {active && (
                              <BadgeCheck className="ml-auto h-4 w-4 shrink-0 text-brand-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setAiDrawerOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 p-0 text-[10px] font-black text-white shadow-md shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 sm:min-h-10 sm:w-auto sm:rounded-2xl sm:px-3.5 sm:py-2.5 sm:text-[11px]"
              aria-label="Buka ARC AI"
              title="ARC AI"
            >
              <Sparkles className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">ARC AI</span>
            </button>

            <div className="relative hidden sm:block">
              <button
                onClick={() => setAccountMenuOpen(current => !current)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:bg-slate-50"
                aria-label="Buka menu akun pengguna"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-700 ring-1 ring-brand-100">
                  {initial}
                </div>
                <div className="hidden max-w-[170px] text-left sm:block">
                  <div className="truncate text-[11px] font-black text-slate-800">{currentUser.name}</div>
                  <div className="truncate text-[9px] text-slate-400">{currentUser.roleTitle}</div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-[310px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/10">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{currentUser.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">{currentUser.email}</div>
                        <div className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700">
                          {currentUser.roleTitle}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 px-1 text-[10px] text-slate-500">
                    <div>
                      <span className="font-bold text-slate-700">Institusi:</span>{' '}
                      {currentUser.institutionName || 'Belum ditetapkan'}
                    </div>
                    {currentUser.department && (
                      <div>
                        <span className="font-bold text-slate-700">Unit:</span> {currentUser.department}
                      </div>
                    )}
                    <p className="leading-4">
                      Role dan hak akses ditetapkan oleh administrator. Pengguna tidak dapat berpindah role dari sesi ini.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Link
                      href="/profile"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      <UserRound className="h-4 w-4" />
                      {copy.profile}
                    </Link>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black text-slate-600">
                        <Languages className="h-3.5 w-3.5 text-brand-600" />
                        {copy.language}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => changeLanguage('id')}
                          aria-pressed={language === 'id'}
                          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-black transition ${
                            language === 'id'
                              ? 'border-brand-200 bg-white text-brand-700 shadow-sm'
                              : 'border-transparent bg-transparent text-slate-500 hover:bg-white'
                          }`}
                        >
                          {language === 'id' && <BadgeCheck className="h-3.5 w-3.5" />}
                          {copy.indonesian}
                        </button>
                        <button
                          type="button"
                          onClick={() => changeLanguage('en')}
                          aria-pressed={language === 'en'}
                          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-black transition ${
                            language === 'en'
                              ? 'border-brand-200 bg-white text-brand-700 shadow-sm'
                              : 'border-transparent bg-transparent text-slate-500 hover:bg-white'
                          }`}
                        >
                          {language === 'en' && <BadgeCheck className="h-3.5 w-3.5" />}
                          {copy.english}
                        </button>
                      </div>
                    </div>
                    {currentUser.role === 'Admin' && (
                      <Link
                        href="/admin/security"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        <LockKeyhole className="h-4 w-4" />
                        {copy.security}
                      </Link>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                  >
                    <LogOut className="h-4 w-4" />
                    {copy.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-5 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div
          className={`sticky top-[96px] hidden h-[calc(100vh-112px)] shrink-0 transition-[width] duration-300 ease-out lg:block ${
            sidebarCollapsed ? 'w-[76px]' : 'w-[272px]'
          }`}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            title={sidebarCollapsed ? 'Tampilkan menu' : 'Sembunyikan menu'}
            className="group/toggle absolute -right-4 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-500 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.45)] ring-4 ring-slate-50/90 backdrop-blur transition-all duration-200 hover:scale-105 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 hover:shadow-[0_12px_32px_-10px_rgba(2,132,199,0.45)] focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover/toggle:translate-x-0.5" />
            ) : (
              <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover/toggle:-translate-x-0.5" />
            )}

            <span
              className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-150 group-hover/toggle:opacity-100 xl:block ${
                sidebarCollapsed ? 'left-[46px]' : 'right-[46px]'
              }`}
            >
              {sidebarCollapsed ? 'Tampilkan menu' : 'Sembunyikan menu'}
            </span>
          </button>

          <aside className="h-full overflow-y-auto overflow-x-hidden pb-4 pr-1">
            <Nav collapsed={sidebarCollapsed} />
          </aside>
        </div>

        <main className="min-w-0 flex-1 pb-24 lg:pb-6">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm lg:hidden">
          <div className="h-full w-[86vw] max-w-sm overflow-y-auto bg-slate-50 p-4 shadow-2xl">
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-slate-200 bg-slate-50 pb-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src="/brand/total-arc-logo.svg"
                  alt="Total ARC"
                  className="h-[46px] w-auto max-w-[158px] object-contain"
                />
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 xs:inline">
                  {copy.navigation}
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-white"
                aria-label="Tutup navigasi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Nav mobile />

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-black text-brand-700 ring-1 ring-brand-100">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-900">{currentUser.name}</div>
                  <div className="truncate text-[10px] text-slate-400">
                    {currentUser.roleTitle} · {currentUser.institutionName || 'Institusi'}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                >
                  <UserRound className="h-4 w-4" />
                  {copy.profile}
                </Link>

                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                    <Languages className="h-4 w-4 text-brand-600" />
                    {copy.language}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => changeLanguage('id')}
                      aria-pressed={language === 'id'}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                        language === 'id'
                          ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
                      }`}
                    >
                      {language === 'id' && <BadgeCheck className="h-4 w-4" />}
                      Indonesia
                    </button>
                    <button
                      type="button"
                      onClick={() => changeLanguage('en')}
                      aria-pressed={language === 'en'}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                        language === 'en'
                          ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
                      }`}
                    >
                      {language === 'en' && <BadgeCheck className="h-4 w-4" />}
                      English
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void logout()
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                >
                  <LogOut className="h-4 w-4" />
                  {copy.signOut}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden">
        {mobileItems.map(item => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[54px] min-w-[58px] flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-[10px] font-bold ${
                pathname === item.href ? 'bg-brand-50 text-brand-700' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-h-[54px] min-w-[58px] flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-[10px] font-bold text-slate-500"
        >
          <Menu className="h-5 w-5" />
          <span className="mt-0.5">{copy.more}</span>
        </button>
      </nav>

      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
