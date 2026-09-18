'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import {
  Shield, Layers, FileCheck, ClipboardCheck, Activity, Calendar, CheckSquare,
  Search, Plus, Sparkles, Building2, Menu, X, FileSpreadsheet, Cpu,
  AlertTriangle, FolderTree, BadgeCheck, Workflow, Download, LogOut, UserRound
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface SearchResult {
  id: string;
  type: string;
  code: string;
  title: string;
  href: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, institutionName, loadingUser } = useRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const pillars = useMemo(() => [
    {
      title: 'MANAGE',
      subtitle: 'Define and Govern',
      items: [
        { name: 'Core Dashboard', href: '/', icon: Activity },
        { name: 'Institution Onboarding', href: '/onboarding', icon: Building2, roles: ['Admin'] },
        { name: 'User Administration', href: '/users', icon: UserRound, roles: ['Admin'] },
        { name: 'Organization Structure', href: '/organization', icon: FolderTree },
        { name: 'Process Architecture (BPM)', href: '/processes', icon: Layers },
        { name: 'Risk Universe & Heatmap', href: '/risks', icon: AlertTriangle },
        { name: 'Single Control Library', href: '/controls', icon: Shield },
        { name: 'Relational RCM Workspace', href: '/rcm', icon: FileSpreadsheet }
      ] as NavItem[]
    },
    {
      title: 'ASSURE',
      subtitle: 'Assess and Validate',
      items: [
        { name: 'RCSA & CSA Workspace', href: '/rcsa', icon: ClipboardCheck },
        { name: 'ICOFR & Assertions', href: '/icofr', icon: FileCheck },
        { name: 'Walkthrough & ToD', href: '/tod', icon: Workflow },
        { name: 'ToE Testing & Samples', href: '/toe', icon: Cpu },
        { name: 'Remediation & MAP', href: '/remediation', icon: BadgeCheck }
      ] as NavItem[]
    },
    {
      title: 'MONITOR',
      subtitle: 'Monitor and Respond',
      items: [
        { name: 'Control Health Cockpit', href: '/health', icon: Activity },
        { name: 'Continuous Monitoring (CCM)', href: '/ccm', icon: Cpu },
        { name: 'Certification & Attestation', href: '/certification', icon: BadgeCheck },
        { name: 'Assurance Calendar', href: '/calendar', icon: Calendar },
        { name: 'Task Center & Escalation', href: '/tasks', icon: CheckSquare },
        { name: 'Workpapers & Export Center', href: '/reports', icon: Download }
      ] as NavItem[]
    }
  ], []);

  useEffect(() => {
    if (pathname === '/login' || loadingUser) return;
    if (!currentUser) {
      window.location.assign(`/login?next=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    if (currentUser.mustChangePassword && pathname !== '/change-password') {
      window.location.assign('/change-password');
    }
  }, [pathname, loadingUser, currentUser]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2 || !currentUser) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error(error);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, currentUser]);

  if (pathname === '/login' || pathname === '/change-password') return <>{children}</>;

  if (loadingUser || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-semibold text-slate-600">Validating secure session…</div>
      </div>
    );
  }

  const allowed = (item: NavItem) => !item.roles || item.roles.includes(currentUser.role);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="space-y-5">
      {pillars.map(pillar => (
        <section key={pillar.title}>
          <div className="px-3 py-1">
            <div className="text-[10px] font-black tracking-widest text-slate-900">{pillar.title}</div>
            <div className="text-[10px] text-slate-400">{pillar.subtitle}</div>
          </div>
          <div className="mt-1 space-y-0.5">
            {pillar.items.filter(allowed).map(item => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors ${active ? 'bg-brand-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Open navigation">
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center gap-3 min-w-fit">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 via-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="font-extrabold text-lg tracking-tight text-slate-900">TOTAL <span className="text-brand-600">ARC</span></div>
              <div className="text-[10px] text-slate-500 hidden sm:block">Total Assurance, Risk & Control</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-xs min-w-0">
            <Building2 className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="font-semibold text-slate-700 truncate max-w-48">{institutionName}</span>
          </div>

          <div className="hidden lg:block flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search process, risk, control, issue…"
              className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {(searchResults.length > 0 || searching) && (
              <div className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
                {searching && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
                {searchResults.map(item => (
                  <Link key={`${item.type}-${item.id}`} href={item.href} onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="block px-3 py-2 hover:bg-slate-50 border-t border-slate-100 first:border-t-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-900 truncate">{item.title}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{item.type}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{item.code}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/processes" className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
              <Plus className="w-3.5 h-3.5" /> New Record
            </Link>
            <button onClick={() => setAiDrawerOpen(true)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
              <Sparkles className="w-3.5 h-3.5" /> ARC AI
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                <UserRound className="w-4 h-4" />
              </div>
              <div className="max-w-36">
                <div className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{currentUser.role}</div>
              </div>
              <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Sign out" aria-label="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        <aside className="hidden lg:block w-64 shrink-0"><Sidebar /></aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-80 max-w-[88vw] bg-white h-full p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
              <div>
                <div className="font-bold text-slate-900">{currentUser.name}</div>
                <div className="text-xs text-slate-500">{institutionName} • {currentUser.role}</div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <Sidebar mobile />
            <button onClick={logout} className="mt-6 w-full flex items-center justify-center gap-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg py-2.5">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
