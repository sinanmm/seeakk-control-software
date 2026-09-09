import * as React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppSidebar session={session} />
      <div className="lg:pl-64 flex flex-col flex-1">
        <AppHeader session={session} />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
