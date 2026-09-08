'use client';

import * as React from 'react';
import { AdminSession } from '@/types/auth';
import { ShieldCheck, Database, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AppHeaderProps {
  session?: AdminSession | null;
}

export function AppHeader({ session }: AppHeaderProps) {
  const today = format(new Date(), 'EEEE, dd MMM yyyy');

  return (
    <header className="h-14 bg-zinc-950/60 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-20 px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 pl-10 lg:pl-0">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          <Calendar className="h-3.5 w-3.5 text-zinc-500" />
          <span>{today}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Isolation Environment Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
          <Database className="h-3 w-3 text-emerald-400" />
          <span>CONTROL DB:</span>
          <span className="text-emerald-400 font-semibold">ISOLATED</span>
        </div>

        {/* Security / Role Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono text-indigo-400">
          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
          <span>{session?.role || 'SUPER_ADMIN'}</span>
        </div>
      </div>
    </header>
  );
}
