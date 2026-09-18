'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, USERS, type UserRole } from '@/context/RoleContext';
import {
  Activity, AlertTriangle, BadgeCheck, Building2, Calendar, CheckSquare, ChevronDown,
  ClipboardCheck, Cpu, Download, FileCheck, FileSpreadsheet, FolderTree, Layers, Menu,
  Plus, Shield, Sparkles, Workflow, X
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';

interface NavItem { name: string; href: string; icon: React.ElementType; badge?: string; }
interface NavGroup { title: string; subtitle: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  {
    title: 'MANAGE',
    subtitle: 'Define and govern',
    items: [
      { name: 'Core Dashboard', href: '/', icon: Activity },
      { name: 'Institution Onboarding', href: '/onboarding', icon: Building2 },
      { name: 'Organization Structure', href: '/organization', icon: FolderTree },
      { name: 'Process Architecture (BPM)', href: '/processes', icon: Layers, badge: 'L0-L5' },
      { name: 'Risk Universe & Heatmap', href: '/risks', icon: AlertTriangle },
      { name: 'Single Control Library', href: '/controls', icon: Shield },
      { name: 'Relational RCM Workspace', href: '/rcm', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'ASSURE',
    subtitle: 'Assess and validate',
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
    subtitle: 'Monitor and respond',
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, setRole, institutionName } = useRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const Nav = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {navGroups.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="px-3 py-1.5">
            <div className="text-xs font-black tracking-wider text-slate-900">{group.title}</div>
            <div className="text-[10px] text-slate-500">{group.subtitle}</div>
          </div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => mobile && setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                  active ? 'bg-brand-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5"><Icon className="w-4 h-4" />{item.name}</span>
                {item.badge && <span className="text-[10px] opacity-70">{item.badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-500"><Menu className="w-5 h-5" /></button>
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center"><Shield className="w-6 h-6" /></div>
              <div>
                <div className="font-extrabold text-xl text-slate-900">TOTAL <span className="text-brand-600">ARC</span></div>
                <div className="hidden sm:block text-[10px] text-slate-500">Total Assurance, Risk & Control Platform</div>
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-brand-600" />
            <span className="font-semibold">{institutionName}</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/onboarding" className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 rounded-lg border border-slate-200">
              <Plus className="w-3.5 h-3.5" /> Register Institution
            </Link>
            <button onClick={() => setAiDrawerOpen(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-brand-600 text-white rounded-lg">
              <Sparkles className="w-3.5 h-3.5" /> ARC AI
            </button>

            <div className="relative">
              <button onClick={() => setRoleDropdownOpen(!roleDropdownOpen)} className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-200 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{currentUser.role.charAt(0)}</div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-800">{currentUser.role}</div>
                  <div className="text-[10px] text-slate-500">{currentUser.roleTitle}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {roleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">View as role</div>
                  {(Object.keys(USERS) as UserRole[]).map((role) => (
                    <button
                      key={role}
                      onClick={() => { setRole(role); setRoleDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-50 ${currentUser.role === role ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700'}`}
                    >
                      <div>{role}</div><div className="text-[10px] text-slate-500">{USERS[role].roleTitle}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        <aside className="hidden lg:block w-64 flex-shrink-0 space-y-5">
          <Nav />
          <div className="p-3.5 bg-slate-900 text-white rounded-xl text-xs">
            <div className="font-bold text-emerald-300 mb-1">Data integrity</div>
            <p className="text-[11px] text-slate-300 leading-relaxed">Operational records are shown only when persisted in the connected database. No demo transactions or simulated assurance results are injected into the UI.</p>
          </div>
        </aside>
        <main className="flex-1 min-w-0 pb-16 lg:pb-0">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden">
          <div className="w-80 max-w-[90vw] h-full bg-white p-4 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="font-bold">Total ARC Navigation</span>
              <button onClick={() => setMobileMenuOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <Nav mobile />
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-4 py-2 flex justify-around">
        {[['Home','/',Activity],['Processes','/processes',Layers],['Controls','/controls',Shield],['Tasks','/tasks',CheckSquare]].map(([label, href, Icon]: any) => (
          <Link key={href} href={href} className={`flex flex-col items-center text-[10px] ${pathname === href ? 'text-brand-600 font-bold' : 'text-slate-500'}`}>
            <Icon className="w-5 h-5" /><span>{label}</span>
          </Link>
        ))}
        <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center text-[10px] text-slate-500"><Menu className="w-5 h-5" /><span>More</span></button>
      </nav>

      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
