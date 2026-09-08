'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  Building2,
  Layers,
  Repeat,
  Gauge,
  Receipt,
  Users,
  ShieldAlert,
  FileClock,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Menu,
  X,
} from 'lucide-react';
import { logoutAction } from '@/server/actions/auth.actions';
import { AdminSession } from '@/types/auth';

interface AppSidebarProps {
  session?: AdminSession | null;
}

export function AppSidebar({ session }: AppSidebarProps) {
  const pathname = usePathname();
  const [adminOpen, setAdminOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Companies', href: '/companies', icon: Building2 },
    { label: 'Plans', href: '/plans', icon: Layers },
    { label: 'Subscriptions', href: '/subscriptions', icon: Repeat },
    { label: 'Usage', href: '/usage', icon: Gauge },
    { label: 'Billing', href: '/billing', icon: Receipt },
  ];

  const adminSubItems = [
    { label: 'Admin Users', href: '/administration/admins', icon: Users },
    { label: 'Roles & Permissions', href: '/administration/roles', icon: Shield },
    { label: 'Audit Logs', href: '/administration/audit-logs', icon: FileClock },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const isAdminActive = adminSubItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Mobile Hamburger Button */}
      <div className="lg:hidden fixed top-3 left-3 z-40">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-zinc-950 border-r border-zinc-800/80 transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="h-14 px-5 border-b border-zinc-800 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-inner">
              S
            </div>
            <div>
              <div className="text-xs font-bold tracking-wider text-zinc-100 uppercase">
                SEEAKK
              </div>
              <div className="text-[10px] font-medium tracking-tight text-indigo-400 font-mono">
                CONTROL SOFTWARE
              </div>
            </div>
          </Link>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            v1.0
          </span>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-none">
          <div className="px-3 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Operations
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  active
                    ? 'bg-indigo-600/10 text-indigo-400 font-semibold border border-indigo-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-indigo-400' : 'text-zinc-400')} />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-4 px-3 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Governance
          </div>

          {/* Administration Dropdown / Section */}
          <div>
            <button
              type="button"
              onClick={() => setAdminOpen(!adminOpen)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                isAdminActive
                  ? 'text-zinc-200 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              )}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-4 w-4 text-zinc-400" />
                <span>Administration</span>
              </div>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-zinc-400 transition-transform duration-150',
                  adminOpen && 'rotate-180'
                )}
              />
            </button>

            {adminOpen && (
              <div className="pl-6 pr-1 pt-1 space-y-1">
                {adminSubItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const active = pathname.startsWith(sub.href);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        active
                          ? 'bg-indigo-600/10 text-indigo-400 font-semibold border border-indigo-500/20'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                      )}
                    >
                      <SubIcon className="h-3.5 w-3.5" />
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 px-3 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            System
          </div>
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              isActive('/settings')
                ? 'bg-indigo-600/10 text-indigo-400 font-semibold border border-indigo-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            )}
          >
            <Settings className="h-4 w-4 text-zinc-400" />
            Settings
          </Link>
        </div>

        {/* User Footer / Log Out */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200 shrink-0">
                {session?.name ? session.name[0] : 'A'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {session?.name || 'Administrator'}
                </div>
                <div className="text-[10px] font-mono text-indigo-400 truncate">
                  {session?.role || 'SUPER_ADMIN'}
                </div>
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Log out"
                className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
