'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/auth/provider';
import { resolveActiveNav, NavItem } from '../lib/navigation';
import { LayoutDashboard, FileText, Users, CreditCard, Settings, LogOut, Menu, X, User } from 'lucide-react';

const navItems: Array<{
  name: string;
  href: string;
  id: NavItem;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { name: 'Dashboard', href: '/', id: 'dashboard', icon: LayoutDashboard },
  { name: 'Invoices', href: '/invoices', id: 'invoices', icon: FileText },
  { name: 'Clients', href: '/clients', id: 'clients', icon: Users },
  { name: 'Payments', href: '/payments', id: 'payments', icon: CreditCard },
  { name: 'Settings', href: '/settings', id: 'settings', icon: Settings },
];

function NavigationLinks({
  isMobile,
  onItemClick
}: {
  isMobile?: boolean;
  onItemClick?: () => void;
}) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const activeNav = resolveActiveNav(pathname, searchParams?.toString() || '');

  return (
    <nav className={isMobile ? 'space-y-4' : 'space-y-1.5'}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            onClick={onItemClick}
            className={
              isMobile
                ? `flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-medium transition text-base ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`
                : `flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`
            }
          >
            <Icon className={isMobile ? 'h-5 w-5' : 'h-4.5 w-4.5'} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function NavigationLinksFallback({ isMobile }: { isMobile?: boolean }) {
  const pathname = usePathname() || '/';
  const activeNav = resolveActiveNav(pathname, '');

  return (
    <nav className={isMobile ? 'space-y-4' : 'space-y-1.5'}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            className={
              isMobile
                ? `flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-medium transition text-base ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`
                : `flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`
            }
          >
            <Icon className={isMobile ? 'h-5 w-5' : 'h-4.5 w-4.5'} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-slate-900/40 border-b border-slate-900/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm text-white">C</div>
          <span className="font-bold tracking-tight text-white">Clario</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-400 hover:text-white focus:outline-none"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[61px] z-30 bg-slate-950/95 backdrop-blur-xl animate-fade-in flex flex-col justify-between p-6">
          <Suspense fallback={<NavigationLinksFallback isMobile />}>
            <NavigationLinks isMobile onItemClick={() => setMobileMenuOpen(false)} />
          </Suspense>

          <div className="border-t border-slate-900 pt-6 space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                <User className="h-4.5 w-4.5" />
              </div>
              <div className="truncate">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Logged in as</p>
                <p className="text-sm font-medium text-slate-300 truncate max-w-[200px]">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-xl transition text-base font-semibold"
            >
              <LogOut className="h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900/30 border-r border-slate-900/80 p-6 shrink-0 sticky top-0 h-screen justify-between">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-600/30">C</div>
            <span className="font-extrabold tracking-tight text-white text-lg">Clario</span>
          </div>

          {/* Navigation Links */}
          <Suspense fallback={<NavigationLinksFallback />}>
            <NavigationLinks />
          </Suspense>
        </div>

        {/* Footer Settings/Profile */}
        <div className="border-t border-slate-900/60 pt-6 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 shrink-0 border border-slate-800">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Freelancer</p>
              <p className="text-xs font-semibold text-slate-300 truncate" title={user?.email}>{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-lg transition"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
