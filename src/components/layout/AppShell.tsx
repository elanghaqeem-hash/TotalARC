'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import type { PermissionKey } from '@/lib/security-model';
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
  FileArchive,
  FileCheck,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Layers,
  Link2,
  LogOut,
  Menu,
  Settings,
  Shield,
  Sparkles,
  Target,
  User,
  Users,
  Workflow,
  X
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission: PermissionKey;
  badge?: string;
}

interface NavGroup {
  title: string;
  subtitle: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'MANAGE',
    subtitle: 'Define & govern',
    items: [
      { name: 'Core Dashboard', href: '/', icon: Activity, permission: 'dashboard.view' },
      { name: 'Institution Onboarding', href: '/onboarding', icon: Building2, permission: 'institution.manage' },
      { name: 'Organization Structure', href: '/organization', icon: FolderTree, permission: 'organization.view' },
      { name: 'Process Architecture (BPM)', href: '/processes', icon: Layers, badge: 'L0–L5', permission: 'process.view' },
      { name: 'Risk Universe & Heatmap', href: '/risks', icon: AlertTriangle, permission: 'risk.view' },
      { name: 'Single Control Library', href: '/controls', icon: Shield, permission: 'control.view' },
      { name: 'Relational RCM Workspace', href: '/rcm', icon: FileSpreadsheet, permission: 'rcm.view' },
      { name: 'Enterprise Evidence Repository', href: '/evidence', icon: FileArchive, badge: 'FILES', permission: 'evidence.view' }
    ]
  },
  {
    title: 'ASSURE',
    subtitle: 'Assess & validate',
    items: [
      { name: 'RCSA & CSA Workspace', href: '/rcsa', icon: ClipboardCheck, permission: 'rcsa.view' },
      { name: 'ICOFR Program Hub', href: '/icofr', icon: FileCheck, permission: 'icofr.view' },
      { name: 'ICOFR Scoping & Materiality', href: '/icofr/scoping', icon: Target, badge: 'OM · PM', permission: 'icofr.view' },
      { name: 'Accounts, Disclosures & Assertions', href: '/icofr/accounts', icon: FileSpreadsheet, permission: 'icofr.view' },
      { name: 'ICOFR Traceability Matrix', href: '/icofr/traceability', icon: Link2, badge: 'E2E', permission: 'icofr.view' },
      { name: 'ICOFR Coverage & Gap Analytics', href: '/icofr/coverage', icon: BarChart3, badge: 'GAP', permission: 'icofr.view' },
      { name: 'Entity-Level Controls (ELC)', href: '/icofr/elc', icon: Shield, permission: 'icofr.view' },
      { name: 'Process-Level Controls (PLC)', href: '/icofr/plc', icon: ClipboardCheck, permission: 'icofr.view' },
      { name: 'IT General Controls (ITGC)', href: '/icofr/itgc', icon: Cpu, permission: 'icofr.view' },
      { name: 'IT Application Controls (ITAC)', href: '/icofr/itac', icon: Workflow, permission: 'icofr.view' },
      { name: 'IPE & EUC Register', href: '/icofr/information', icon: FileSpreadsheet, permission: 'icofr.view' },
      { name: 'ICOFR Testing Plan & Cycle', href: '/icofr/testing-plan', icon: Calendar, badge: 'PLAN', permission: 'icofr.view' },
      { name: 'ICOFR Smart Testing Strategy', href: '/icofr/smart-testing', icon: Sparkles, badge: 'SMART', permission: 'icofr.view' },
      { name: 'ICOFR Sampling & Evidence', href: '/icofr/sampling-evidence', icon: FileSpreadsheet, badge: 'SAMPLE', permission: 'icofr.view' },
      { name: 'ICOFR Workpaper Review', href: '/icofr/workpaper-review', icon: ClipboardCheck, badge: 'REVIEW', permission: 'icofr.view' },
      { name: 'Walkthrough & ToD', href: '/tod', icon: Workflow, permission: 'icofr.test' },
      { name: 'ToE Testing & Samples', href: '/toe', icon: Cpu, permission: 'icofr.test' },
      { name: 'ICOFR Deficiency Evaluation', href: '/icofr/deficiencies', icon: AlertTriangle, permission: 'icofr.view' },
      { name: 'Remediation & MAP', href: '/remediation', icon: BadgeCheck, permission: 'remediation.view' }
    ]
  },
  {
    title: 'MONITOR',
    subtitle: 'Monitor & respond',
    items: [
      { name: 'Control Health Cockpit', href: '/health', icon: Activity, permission: 'control.view' },
      { name: 'Continuous Monitoring (CCM)', href: '/ccm', icon: Cpu, permission: 'ccm.view' },
      { name: 'ICOFR Certification & Close', href: '/certification', icon: BadgeCheck, badge: 'SIGN', permission: 'certification.view' },
      { name: 'ICOFR Executive Reporting', href: '/icofr/reporting', icon: BarChart3, badge: 'BOARD', permission: 'report.view' },
      { name: 'ICOFR Period Close & Archive', href: '/icofr/period-close', icon: FileCheck, badge: 'LOCK', permission: 'icofr.view' },
      { name: 'ICOFR Roll-Forward', href: '/icofr/roll-forward', icon: Calendar, badge: 'NEW FY', permission: 'icofr.view' },
      { name: 'Assurance Calendar', href: '/calendar', icon: Calendar, permission: 'calendar.view' },
      { name: 'Task Center & Escalation', href: '/tasks', icon: CheckSquare, permission: 'task.view' },
      { name: 'Analytics', href: '/reports', icon: BarChart3, permission: 'report.view' }
    ]
  },
  {
    title: 'ADMINISTRATION',
    subtitle: 'Access & tenant governance',
    items: [
      { name: 'Users & Access', href: '/admin/users', icon: Users, permission: 'user.view' },
      { name: 'Institutions & Tenants', href: '/admin/institutions', icon: Landmark, permission: 'tenant.manage' },
      { name: 'Security Parameters', href: '/admin/security', icon: Settings, permission: 'security.admin' }
    ]
  }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    authenticated,
    loading,
    hasPermission,
    logout,
    switchInstitution
  } = useRole();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [switchingInstitution, setSwitchingInstitution] = useState(false);

  const loginPage = pathname === '/login';

  useEffect(() => {
    if (loginPage) return;
    if (!loading && !authenticated) {
      router.replace('/login');
      return;
    }
    if (!loading && authenticated && currentUser.mustChangePassword && !pathname.startsWith('/profile')) {
      router.replace('/profile?password=required');
    }
  }, [authenticated, currentUser.mustChangePassword, loading, loginPage, pathname, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('total-arc-sidebar-collapsed');
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  const filteredGroups = useMemo(
    () =>
      navGroups
        .map(group => ({
          ...group,
          items: group.items.filter(item => hasPermission(item.permission))
        }))
        .filter(group => group.items.length > 0),
    [currentUser.permissions, hasPermission]
  );

  const toggleSidebar = () => {
    setSidebarCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('total-arc-sidebar-collapsed', String(next));
      return next;
    });
  };

  const prefetchRoute = (href: string) => {
    router.prefetch(href);
  };

  const handleInstitutionSwitch = async (institutionId: string) => {
    if (!institutionId || institutionId === currentUser.institution.id) return;
    setSwitchingInstitution(true);
    try {
      await switchInstitution(institutionId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to switch institution.');
      setSwitchingInstitution(false);
    }
  };

  const Nav = ({ mobile = false, collapsed = false }: { mobile?: boolean; collapsed?: boolean }) => (
    <div className={collapsed ? 'space-y-2' : 'space-y-4'}>
      {filteredGroups.map(group => (
        <section
          key={group.title}
          className={`border border-slate-200 bg-white shadow-sm transition-all duration-200 ${collapsed ? 'rounded-xl p-1.5' : 'rounded-2xl p-2.5'}`}
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
                  className={`group flex items-center rounded-xl text-[11px] transition-all ${collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-2.5 py-2.5'} ${
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

  if (loginPage) {
    return <>{children}</>;
  }

  if (loading || (!authenticated && !loading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
          <img src="/brand/total-arc-logo.svg" alt="Total ARC" className="mx-auto h-12 w-auto" />
          <div className="mt-4 text-xs font-bold text-slate-600">Validating secure session…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-2.5 px-3 sm:gap-4 sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href="/" className="flex min-w-0 items-center" aria-label="Total ARC home">
              <img
                src="/brand/total-arc-logo.svg"
                alt="Total ARC"
                className="h-[42px] w-auto max-w-[122px] object-contain sm:h-[48px] sm:max-w-[150px] md:max-w-[165px]"
              />
            </Link>

            <div className="hidden min-w-0 border-l border-slate-200 pl-3 md:block">
              <div className="max-w-[230px] truncate text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                Active Institution
              </div>
              <div className="max-w-[260px] truncate text-xs font-bold text-slate-800">
                {currentUser.institution.name}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {currentUser.institutions.length > 1 && (
              <select
                value={currentUser.institution.id}
                onChange={event => void handleInstitutionSwitch(event.target.value)}
                disabled={switchingInstitution}
                className="hidden max-w-[210px] rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 outline-none md:block"
                title="Switch active institution"
              >
                {currentUser.institutions.map(institution => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            )}

            {hasPermission('ai.use') && (
              <button
                onClick={() => setAiDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-2.5 py-2.5 text-[10px] font-black text-white shadow-md shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 sm:px-3 sm:text-[11px]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>ARC AI</span>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:bg-slate-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-700 ring-1 ring-brand-100">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden max-w-[150px] text-left sm:block">
                  <div className="truncate text-[11px] font-black text-slate-800">{currentUser.name}</div>
                  <div className="truncate text-[9px] text-slate-400">{currentUser.roleTitle}</div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-black text-slate-900">{currentUser.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">@{currentUser.username}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {currentUser.roles.map(role => (
                        <span key={role} className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-600 ring-1 ring-slate-200">
                          {role.replaceAll('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {currentUser.institutions.length > 1 && (
                    <div className="mt-2 px-1 md:hidden">
                      <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Active institution</label>
                      <select
                        value={currentUser.institution.id}
                        onChange={event => void handleInstitutionSwitch(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                      >
                        {currentUser.institutions.map(institution => (
                          <option key={institution.id} value={institution.id}>{institution.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-2 space-y-1">
                    <Link
                      href="/profile"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <User className="h-4 w-4" /> My Profile & Password
                    </Link>
                    <button
                      onClick={() => void logout()}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-5 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div
          className={`sticky top-[96px] hidden h-[calc(100vh-112px)] shrink-0 transition-[width] duration-300 ease-out lg:block ${sidebarCollapsed ? 'w-[76px]' : 'w-[272px]'}`}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
            className="group/toggle absolute -right-4 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-500 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.45)] ring-4 ring-slate-50/90 backdrop-blur transition-all duration-200 hover:scale-105 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <aside className="h-full overflow-y-auto overflow-x-hidden pb-4 pr-1">
            <Nav collapsed={sidebarCollapsed} />
          </aside>
        </div>

        <main className="min-w-0 flex-1 pb-20 lg:pb-6">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm lg:hidden">
          <div className="h-full w-[88vw] max-w-sm overflow-y-auto bg-slate-50 p-4 shadow-2xl">
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-slate-200 bg-slate-50 pb-3">
              <img src="/brand/total-arc-logo.svg" alt="Total ARC" className="h-[46px] w-auto max-w-[158px] object-contain" />
              <button onClick={() => setMobileMenuOpen(false)} className="rounded-xl p-2 text-slate-500 hover:bg-white" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Nav mobile />
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden">
        {[
          ['Home', '/', Activity, 'dashboard.view'],
          ['Process', '/processes', Layers, 'process.view'],
          ['Controls', '/controls', Shield, 'control.view'],
          ['Tasks', '/tasks', CheckSquare, 'task.view']
        ]
          .filter(([, , , permission]) => hasPermission(permission as PermissionKey))
          .map(([label, href, Icon]: any) => (
            <Link
              key={href}
              href={href}
              className={`flex min-w-[56px] flex-col items-center rounded-xl px-2 py-1 text-[9px] font-bold ${pathname === href ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="mt-0.5">{label}</span>
            </Link>
          ))}
        <button onClick={() => setMobileMenuOpen(true)} className="flex min-w-[56px] flex-col items-center rounded-xl px-2 py-1 text-[9px] font-bold text-slate-500">
          <Menu className="h-[18px] w-[18px]" />
          <span className="mt-0.5">More</span>
        </button>
      </nav>

      {hasPermission('ai.use') && <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />}
    </div>
  );
}
