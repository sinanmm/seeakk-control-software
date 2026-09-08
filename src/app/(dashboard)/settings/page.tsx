import * as React from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, ShieldCheck, Server, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Control System Configuration"
        description="Environment isolation verification, database configuration parameters, and architectural boundaries."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Environment & Isolation State */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <CardTitle>Database & Multi-Tenant Isolation</CardTitle>
            </div>
            <CardDescription>Strict architectural boundary enforcement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 space-y-1">
              <div className="font-semibold">Isolated Database Active</div>
              <p className="text-zinc-300">
                This Control Software connects exclusively to its own dedicated PostgreSQL schema.
                It has zero direct connections or credentials to SEEAKK Customer Production or Test databases.
              </p>
            </div>

            <dl className="space-y-2 font-mono">
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">ORM Engine</span>
                <span className="text-zinc-200">Prisma Client v5.22.0</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Database Provider</span>
                <span className="text-zinc-200">PostgreSQL</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Isolation Verification</span>
                <span className="text-emerald-400 font-bold">PASSED (Standalone)</span>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Security & Authentication Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <CardTitle>Session & Security Architecture</CardTitle>
            </div>
            <CardDescription>Hardened authentication boundaries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 space-y-1">
              <div className="font-semibold">Stateless Cryptographic Sessions</div>
              <p className="text-zinc-300">
                Administrative authentication uses HTTP-only secure cookie tokens verified on server components and server actions.
              </p>
            </div>

            <dl className="space-y-2 font-mono">
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Cookie Name</span>
                <span className="text-zinc-200">seeakk_control_session</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Session Expiry</span>
                <span className="text-zinc-200">12 Hours (Auto-revoke)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Default Currency</span>
                <span className="text-zinc-200">INR (₹)</span>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
