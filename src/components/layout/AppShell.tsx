'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, USERS, type UserRole } from '@/context/RoleContext';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  Cpu,
  Download,
  FileCheck,
  FileSpreadsheet,
  FolderTree,
  Layers,
  Menu,
  Plus,
  Shield,
  Sparkles,
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

const navGroups: NavGroup[] = [
  {
    title: 'MANAGE',
    subtitle: 'Define & govern',
    items: [
      { name: 'Core Dashboard', href: '/', icon: Activity },
      { name: 'Institution Onboarding', href: '/onboarding', icon: Building2 },
      { name: 'Organization Structure', href: '/organization', icon: FolderTree },
      { name: 'Process Architecture (BPM)', href: '/processes', icon: Layers, badge: 'L0–L5' },
      { name: 'Risk Universe & Heatmap', href: '/risks', icon: AlertTriangle },
      { name: 'Single Control Library', href: '/controls', icon: Shield },
      { name: 'Relational RCM Workspace', href: '/rcm', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'ASSURE',
    subtitle: 'Assess & validate',
    items: [
      { name: 'RCSA & CSA Workspace', href: '/rcsa', icon: ClipboardCheck },
      { name: 'ICOFR & Assertions', href: '/icofr', icon: FileCheck },
      { name: 'Walkthrough & ToD', href: '/tod', icon: Workflow },
      { name: 'ToE Testing & Samples', href: '/toe', icon: Cpu },
      { name: 'Remediation & MAP', href: '/remediation', icon: BadgeCheck }
    ]
  },
  {
    title: 'MONITOR',
    subtitle: 'Monitor & respond',
    items: [
      { name: 'Control Health Cockpit', href: '/health', icon: Activity },
      { name: 'Continuous Monitoring (CCM)', href: '/ccm', icon: Cpu },
      { name: 'Certification & Attestation', href: '/certification', icon: BadgeCheck },
      { name: 'Assurance Calendar', href: '/calendar', icon: Calendar },
      { name: 'Task Center & Escalation', href: '/tasks', icon: CheckSquare },
      { name: 'Workpapers & Export Center', href: '/reports', icon: Download }
    ]
  }
];

const topLinks = [
  { name: 'Dashboard', href: '/', icon: Activity },
  { name: 'Processes', href: '/processes', icon: Layers },
  { name: 'Analytics', href: '/reports', icon: BarChart3 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, setRole, institutionName } = useRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const Nav = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="space-y-4">
      {navGroups.map((group) => (
        <section key={group.title} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="px-2.5 pb-2 pt-1">
            <div className="text-[11px] font-black tracking-[0.12em] text-slate-800">{group.title}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{group.subtitle}</div>
          </div>

          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  className={`group flex items-center justify-between rounded-xl px-2.5 py-2.5 text-[11px] transition-all ${
                    active
                      ? 'bg-gradient-to-r from-brand-600 to-sky-500 font-bold text-white shadow-md shadow-sky-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-white/15' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-brand-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate">{item.name}</span>
                  </span>
                  {item.badge && (
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

            <Link href="/" className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-brand-700 text-white shadow-lg shadow-sky-200">
                <Shield className="h-6 w-6" />
              </div>
              <div className="min-w-0 leading-none">
                <div className="text-[15px] font-black tracking-tight text-slate-950 sm:text-lg">
                  <span className="block">TOTAL</span>
                  <span className="mt-1 block text-brand-600">ARC</span>
                </div>
                <div className="mt-1 hidden text-[9px] font-medium leading-none text-slate-400 md:block">Total Assurance, Risk & Control</div>
              </div>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 lg:flex">
            {topLinks.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                    active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden max-w-[280px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 xl:flex">
              <Building2 className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active institution</div>
                <div className="truncate text-[11px] font-bold text-slate-700">{institutionName}</div>
              </div>
            </div>

            <Link
              href="/onboarding"
              className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:border-brand-200 hover:text-brand-700 md:flex"
            >
              <Plus className="h-3.5 w-3.5" />
              Institution
            </Link>

            <button
              onClick={() => setAiDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-2.5 py-2.5 text-[10px] font-black text-white shadow-md shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 sm:px-3 sm:text-[11px]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>ARC AI</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:bg-slate-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-700 ring-1 ring-brand-100">
                  {currentUser.role.charAt(0)}
                </div>
                <div className="hidden max-w-[150px] text-left sm:block">
                  <div className="truncate text-[11px] font-black text-slate-800">{currentUser.role}</div>
                  <div className="truncate text-[9px] text-slate-400">{currentUser.roleTitle}</div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                  <div className="px-2.5 pb-2 pt-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">View as role</div>
                    <div className="mt-1 text-[10px] leading-4 text-slate-500">Ubah perspektif tampilan tanpa membuat identitas pengguna palsu.</div>
                  </div>

                  {(Object.keys(USERS) as UserRole[]).map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        setRole(role);
                        setRoleDropdownOpen(false);
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                        currentUser.role === role ? 'bg-brand-50 text-brand-800' : 'text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{role}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{USERS[role].roleTitle}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-5 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <aside className="sticky top-[96px] hidden h-[calc(100vh-112px)] w-[272px] shrink-0 overflow-y-auto pb-4 lg:block">
          <Nav />
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-4 text-white shadow-lg">
            <div className="flex items-center gap-2 text-[11px] font-black text-emerald-300">
              <Shield className="h-4 w-4" />
              Data integrity
            </div>
            <p className="mt-2 text-[10px] leading-5 text-slate-300">
              Operational records ditampilkan hanya ketika tersimpan pada database terhubung. Tidak ada transaksi demo atau assurance result simulasi.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-20 lg:pb-6">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm lg:hidden">
          <div className="h-full w-[86vw] max-w-sm overflow-y-auto bg-slate-50 p-4 shadow-2xl">
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-slate-200 bg-slate-50 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">Total ARC</div>
                  <div className="text-[10px] text-slate-400">Navigation</div>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-white"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Nav mobile />
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden">
        {[
          ['Home', '/', Activity],
          ['Process', '/processes', Layers],
          ['Controls', '/controls', Shield],
          ['Tasks', '/tasks', CheckSquare]
        ].map(([label, href, Icon]: any) => (
          <Link
            key={href}
            href={href}
            className={`flex min-w-[56px] flex-col items-center rounded-xl px-2 py-1 text-[9px] font-bold ${
              pathname === href ? 'bg-brand-50 text-brand-700' : 'text-slate-500'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="mt-0.5">{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-w-[56px] flex-col items-center rounded-xl px-2 py-1 text-[9px] font-bold text-slate-500"
        >
          <Menu className="h-[18px] w-[18px]" />
          <span className="mt-0.5">More</span>
        </button>
      </nav>

      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
