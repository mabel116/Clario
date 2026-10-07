'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAuth } from '../lib/auth/provider';
import { resolveActiveNav, NavItem } from '../lib/navigation';
import {
  Home,
  FileText,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  PanelLeft,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { SyncIndicator } from './SyncIndicator';
import { cn } from '../lib/utils';

const primaryNavItems: Array<{
  name: string;
  href: string;
  id: NavItem;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; fill?: string }>;
}> = [
  { name: 'Dashboard', href: '/', id: 'dashboard', icon: Home },
  { name: 'Invoices', href: '/invoices', id: 'invoices', icon: FileText },
  { name: 'Payments', href: '/payments', id: 'payments', icon: CreditCard },
  { name: 'Clients', href: '/clients', id: 'clients', icon: Users },
];

const allMobileNavItems = [
  ...primaryNavItems,
  { name: 'Settings', href: '/settings', id: 'settings' as NavItem, icon: Settings },
];

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-full rounded-lg bg-gray-50 dark:bg-[#1c1c21] border border-gray-200 dark:border-[#27272a] animate-pulse" />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-[#1c1c21] dark:hover:text-white border border-gray-200 dark:border-[#27272a] transition-colors tap-target select-none"
      aria-label="Toggle dark mode"
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <Moon className="h-4 w-4 text-blue-400" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500" />
        )}
        <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
      </span>
      <span
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out',
          isDark ? 'bg-blue-600' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            isDark ? 'translate-x-3' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  );
}

function PrimaryNavigationLinks() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const activeNav = resolveActiveNav(pathname, searchParams?.toString() || '');

  return (
    <nav className="space-y-1">
      {primaryNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            className={cn(
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors tap-target group',
              isActive
                ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300'
              )}
              strokeWidth={2}
              fill={isActive ? 'currentColor' : 'none'}
            />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PrimaryNavigationLinksFallback() {
  const pathname = usePathname() || '/';
  const activeNav = resolveActiveNav(pathname, '');

  return (
    <nav className="space-y-1">
      {primaryNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            className={cn(
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors tap-target group',
              isActive
                ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300'
              )}
              strokeWidth={2}
              fill={isActive ? 'currentColor' : 'none'}
            />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SettingsSidebarLink() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const activeNav = resolveActiveNav(pathname, searchParams?.toString() || '');
  const isActive = activeNav === 'settings';

  return (
    <Link
      href="/settings"
      prefetch={false}
      className={cn(
        'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors tap-target group',
        isActive
          ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Settings
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          isActive
            ? 'text-white'
            : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300'
        )}
        strokeWidth={2}
        fill={isActive ? 'currentColor' : 'none'}
      />
      <span>Settings</span>
    </Link>
  );
}

function SettingsSidebarLinkFallback() {
  return (
    <Link
      href="/settings"
      prefetch={false}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium transition-colors tap-target group"
    >
      <Settings
        className="h-[18px] w-[18px] shrink-0 text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300 transition-colors"
        strokeWidth={2}
        fill="none"
      />
      <span>Settings</span>
    </Link>
  );
}

function MobileNavLinks({ onItemClick }: { onItemClick: () => void }) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const activeNav = resolveActiveNav(pathname, searchParams?.toString() || '');

  return (
    <nav className="space-y-1.5">
      {allMobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            onClick={onItemClick}
            className={cn(
              'flex items-center gap-3 px-3.5 py-3 rounded-xl text-base transition-colors tap-target group',
              isActive
                ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300'
              )}
              strokeWidth={2}
              fill={isActive ? 'currentColor' : 'none'}
            />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNavLinksFallback({ onItemClick }: { onItemClick: () => void }) {
  const pathname = usePathname() || '/';
  const activeNav = resolveActiveNav(pathname, '');

  return (
    <nav className="space-y-1.5">
      {allMobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeNav;
        return (
          <Link
            key={item.name}
            href={item.href}
            prefetch={false}
            onClick={onItemClick}
            className={cn(
              'flex items-center gap-3 px-3.5 py-3 rounded-xl text-base transition-colors tap-target group',
              isActive
                ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1c1c21] font-medium'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-700 dark:group-hover:text-zinc-300'
              )}
              strokeWidth={2}
              fill={isActive ? 'currentColor' : 'none'}
            />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function HeaderTitle() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const activeNav = resolveActiveNav(pathname, searchParams?.toString() || '');

  const titles: Record<NavItem, string> = {
    dashboard: 'Dashboard',
    invoices: 'Invoices',
    payments: 'Payments',
    clients: 'Clients',
    settings: 'Settings',
  };

  return (
    <h1 className="text-base font-semibold text-gray-900 dark:text-white hidden sm:block">
      {titles[activeNav] || 'Dashboard'}
    </h1>
  );
}

function HeaderTitleFallback() {
  return (
    <h1 className="text-base font-semibold text-gray-900 dark:text-white hidden sm:block">
      Dashboard
    </h1>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090b] text-gray-900 dark:text-white flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] flex flex-col justify-between hidden md:flex shrink-0 sticky top-0 h-screen p-4 select-none">
        {/* Top Section */}
        <div className="space-y-6">
          {/* Brand Logo & Layout Toggle */}
          <div className="flex items-center justify-between px-2 py-1">
            <Link
              href="/"
              prefetch={false}
              className="flex items-center gap-2.5 tap-target group"
            >
              <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-base text-white shadow-sm shadow-blue-600/30">
                C
              </div>
              <span className="font-extrabold tracking-tight text-gray-900 dark:text-white text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Clario
              </span>
            </Link>
            <PanelLeft className="h-4 w-4 text-gray-400 dark:text-zinc-500" aria-hidden="true" />
          </div>

          {/* Primary Navigation Items */}
          <Suspense fallback={<PrimaryNavigationLinksFallback />}>
            <PrimaryNavigationLinks />
          </Suspense>
        </div>

        {/* Bottom Section */}
        <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-[#27272a]">
          {/* Settings Link */}
          <Suspense fallback={<SettingsSidebarLinkFallback />}>
            <SettingsSidebarLink />
          </Suspense>

          {/* Dark Mode Toggle */}
          <ThemeToggle />

          {/* Sync Indicator */}
          <div className="pt-1">
            <SyncIndicator className="w-full justify-between bg-gray-50 dark:bg-[#1c1c21] border-gray-200 dark:border-[#27272a] text-gray-600 dark:text-zinc-400 px-3 py-1.5 shadow-none" />
          </div>

          {/* User Profile Info & Sign Out */}
          <div className="pt-2 border-t border-gray-100 dark:border-[#27272a]/60 flex items-center justify-between px-1">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                Logged in
              </p>
              <p
                className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate"
                title={user?.email || ''}
              >
                {user?.email || 'Freelancer'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-gray-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 tap-target h-8 w-8"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Column with Top Global Header */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Global Header */}
        <header className="h-16 border-b border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#121215] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors">
          {/* Left: Hamburger Menu (Mobile) & Breadcrumb Context */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white tap-target"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Suspense fallback={<HeaderTitleFallback />}>
              <HeaderTitle />
            </Suspense>
          </div>

          {/* Center / Search: Input Trigger */}
          <div className="relative max-w-xs md:max-w-sm w-full mx-4 hidden sm:block">
            <Input
              type="text"
              placeholder="Search anything..."
              leadingIcon={<Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" />}
              trailingIcon={
                <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-[#1c1c21] border border-gray-200 dark:border-[#27272a] rounded select-none">
                  ⌘K
                </kbd>
              }
              className="h-9 text-xs bg-gray-50 dark:bg-[#1c1c21] border-gray-200 dark:border-[#27272a] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-blue-500"
              aria-label="Search"
            />
          </div>

          {/* Right: Notification Bell & User Avatar Pill */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white tap-target"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-600" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#1c1c21] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 tap-target"
                  aria-label="User account menu"
                >
                  <div className="h-8 w-8 rounded-full bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center font-semibold text-xs uppercase">
                    {user?.email ? user.email.slice(0, 2) : 'CL'}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-[#27272a]">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {user?.email}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-400 uppercase tracking-wider mt-0.5">
                    Solo Freelancer
                  </p>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/settings" prefetch={false} className="flex items-center gap-2 cursor-pointer w-full">
                    <Settings className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-rose-600 dark:text-rose-400 focus:text-rose-600 dark:focus:text-rose-400 flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="bg-white dark:bg-[#09090b] min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 text-gray-900 dark:text-white transition-colors flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Scrim */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity animate-in fade-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-Over Drawer Content */}
          <div className="relative z-50 w-72 max-w-[85vw] bg-white dark:bg-[#121215] border-r border-gray-200 dark:border-[#27272a] shadow-2xl flex flex-col justify-between p-5 animate-in slide-in-from-left duration-200">
            {/* Top Brand & Close */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Link
                  href="/"
                  prefetch={false}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 tap-target"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-base text-white shadow-sm shadow-blue-600/30">
                    C
                  </div>
                  <span className="font-extrabold tracking-tight text-gray-900 dark:text-white text-lg">
                    Clario
                  </span>
                </Link>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-400 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white tap-target"
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Mobile Navigation Items */}
              <Suspense fallback={<MobileNavLinksFallback onItemClick={() => setMobileMenuOpen(false)} />}>
                <MobileNavLinks onItemClick={() => setMobileMenuOpen(false)} />
              </Suspense>
            </div>

            {/* Bottom Actions */}
            <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-[#27272a]">
              <ThemeToggle />

              <div className="pt-1">
                <SyncIndicator className="w-full justify-between bg-gray-50 dark:bg-[#1c1c21] border-gray-200 dark:border-[#27272a] text-gray-600 dark:text-zinc-400 px-3 py-1.5 shadow-none" />
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-[#27272a]/60 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    Logged in
                  </p>
                  <p
                    className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate"
                    title={user?.email || ''}
                  >
                    {user?.email || 'Freelancer'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                  }}
                  className="text-rose-600 dark:text-rose-400 tap-target h-9 w-9"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
