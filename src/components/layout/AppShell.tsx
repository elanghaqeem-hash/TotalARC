'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, USERS, type UserRole } from '@/context/RoleContext';
import {
  Shield,
  Layers,
  FileCheck,
  ClipboardCheck,
  Activity,
  Calendar,
  CheckSquare,
  Search,
  Plus,
  Sparkles,
  ChevronDown,
  Building2,
  Users,
  Menu,
  X,
  FileSpreadsheet,
  Cpu,
  AlertTriangle,
  FolderTree,
  FileText,
  BadgeCheck,
  Workflow,
  Download
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavPillar {
  title: string;
  subtitle: string;
  color: string;
  items: NavItem[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, setRole, institutionName } = useRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const pillars: NavPillar[] = [
    {
      title: 'MANAGE',
      subtitle: 'Define and Govern',
      color: 'text-brand-600 border-brand-500 bg-brand-50/70',
      items: [
        { name: 'Core Dashboard', href: '/', icon: Activity },
        { name: 'Institution Onboarding', href: '/onboarding', icon: Building2 },
        { name: 'Organization Structure', href: '/organization', icon: FolderTree },
        { name: 'Process Architecture (BPM)', href: '/processes', icon: Layers, badge: 'L0-L5' },
        { name: 'Risk Universe & Heatmap', href: '/risks', icon: AlertTriangle },
        { name: 'Single Control Library', href: '/controls', icon: Shield },
        { name: 'Relational RCM Workspace', href: '/rcm', icon: FileSpreadsheet, badge: 'Dynamic' }
      ]
    },
    {
      title: 'ASSURE',
      subtitle: 'Assess and Validate',
      color: 'text-sky-700 border-sky-500 bg-sky-50/70',
      items: [
        { name: 'RCSA & CSA Workspace', href: '/rcsa', icon: ClipboardCheck },
        { name: 'ICOFR & Assertions', href: '/icofr', icon: FileCheck, badge: 'SOX' },
        { name: 'Walkthrough & ToD', href: '/tod', icon: Workflow },
        { name: 'ToE Testing & Samples', href: '/toe', icon: Cpu, badge: '25 Samples' },
        { name: 'Remediation & MAP', href: '/remediation', icon: BadgeCheck, badge: 'Retest' }
      ]
    },
    {
      title: 'MONITOR',
      subtitle: 'Monitor and Respond',
      color: 'text-emerald-700 border-emerald-500 bg-emerald-50/70',
      items: [
        { name: 'Control Health Cockpit', href: '/health', icon: Activity, badge: '360°' },
        { name: 'Continuous Monitoring (CCM)', href: '/ccm', icon: Cpu, badge: 'Real-time' },
        { name: 'Certification & Attestation', href: '/certification', icon: BadgeCheck },
        { name: 'Assurance Calendar', href: '/calendar', icon: Calendar },
        { name: 'Task Center & Escalation', href: '/tasks', icon: CheckSquare },
        { name: 'Workpapers & Export Center', href: '/reports', icon: Download }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* TOPBAR */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 via-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900">
                    TOTAL <span className="text-brand-600">ARC</span>
                  </span>
                  <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                    Enterprise
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 hidden md:block font-medium">
                  Total Assurance, Risk & Control Platform
                </p>
              </div>
            </Link>
          </div>

          {/* Institution Selector */}
          <div className="hidden md:flex items-center space-x-2 bg-slate-100/80 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700">
            <Building2 className="w-4 h-4 text-brand-600" />
            <span className="font-semibold">{institutionName}</span>
            <span className="text-[10px] text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
              NDS.JK
            </span>
          </div>

          {/* Search Box */}
          <div className="hidden lg:flex flex-1 max-w-xs relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Global Search (Process, Risk, Control, Issue)..."
              className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center space-x-3">
            {/* Quick Action */}
            <Link
              href="/onboarding"
              className="hidden sm:inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Inst</span>
            </Link>

            {/* AI Assistant Button */}
            <button
              onClick={() => setAiDrawerOpen(true)}
              className="inline-flex items-center space-x-1.5 bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-700 hover:to-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-brand-500/20 transition-all hover:scale-[1.02]"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-200 animate-pulse" />
              <span>ARC AI</span>
            </button>

            {/* Active Role Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                className="flex items-center space-x-2 bg-white border border-slate-200 hover:border-brand-400 rounded-lg p-1.5 sm:px-2.5 transition-all text-left"
              >
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center border border-brand-200">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-none">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-brand-600 font-medium mt-0.5">
                    {currentUser.roleTitle}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Role (RBAC Simulation)
                    </span>
                  </div>
                  {(Object.keys(USERS) as UserRole[]).map(roleKey => {
                    const u = USERS[roleKey];
                    const isSelected = currentUser.role === roleKey;
                    return (
                      <button
                        key={roleKey}
                        onClick={() => {
                          setRole(roleKey);
                          setRoleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-brand-50 font-bold text-brand-700' : 'text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">{u.roleTitle}</div>
                        </div>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-brand-600"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BODY LAYOUT */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden lg:block w-64 flex-shrink-0 space-y-6">
          {pillars.map(pillar => (
            <div key={pillar.title} className="space-y-1">
              <div className="px-3 py-1.5 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black tracking-wider text-slate-900">
                    {pillar.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {pillar.subtitle}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                  {pillar.items.length}
                </span>
              </div>

              <div className="space-y-0.5">
                {pillar.items.map(item => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-brand-600 text-white font-bold shadow-sm shadow-brand-500/20'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200/70 text-slate-600'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Info Box */}
          <div className="p-3.5 bg-gradient-to-br from-brand-900 to-navy-950 text-white rounded-xl shadow-sm text-xs space-y-2 border border-brand-800">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-sky-200">PT Nusantara Scenario</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Procure to Pay (PRC-P2P-001) is fully seeded with live sample tests, exceptions, 5-Why root cause, and retests.
            </p>
            <Link
              href="/toe"
              className="inline-block text-[11px] text-sky-400 hover:text-sky-300 font-bold underline"
            >
              View ToE Test Workpaper →
            </Link>
          </div>
        </aside>

        {/* MOBILE SLIDE-OVER MENU */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm lg:hidden flex">
            <div className="w-72 bg-white h-full p-4 overflow-y-auto space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="font-bold text-base text-slate-900">Total ARC Navigation</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pillars.map(pillar => (
                <div key={pillar.title} className="space-y-1">
                  <div className="px-2 py-1 font-bold text-xs text-slate-800 uppercase tracking-wider">
                    {pillar.title}
                  </div>
                  {pillar.items.map(item => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block px-3 py-2 rounded-lg text-xs font-medium ${
                        pathname === item.href
                          ? 'bg-brand-600 text-white font-bold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MAIN CONTENT WORKSPACE */}
        <main className="flex-1 min-w-0 pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION (Section 10 & 137) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around shadow-lg">
        <Link
          href="/"
          className={`flex flex-col items-center text-[10px] ${
            pathname === '/' ? 'text-brand-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span>Home</span>
        </Link>
        <Link
          href="/processes"
          className={`flex flex-col items-center text-[10px] ${
            pathname === '/processes' ? 'text-brand-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span>Processes</span>
        </Link>
        <Link
          href="/controls"
          className={`flex flex-col items-center text-[10px] ${
            pathname === '/controls' ? 'text-brand-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Shield className="w-5 h-5" />
          <span>Controls</span>
        </Link>
        <Link
          href="/tasks"
          className={`flex flex-col items-center text-[10px] ${
            pathname === '/tasks' ? 'text-brand-600 font-bold' : 'text-slate-500'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span>Tasks</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center text-[10px] text-slate-500"
        >
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* AI CHAT COPILOT DRAWER */}
      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
