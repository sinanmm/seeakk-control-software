import * as React from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock, Check } from 'lucide-react';

export const dynamic = 'force-dynamic';

const ROLES_INFO = [
  {
    name: 'SUPER_ADMIN',
    badge: 'Unrestricted',
    description:
      'Complete, unrestricted authority across all company tenants, financial invoices, custom limit overrides, and system configuration.',
    modules: [
      'Company Creation & Status Control',
      'Entitlement Limit Overrides',
      'Grace Period Authorization',
      'Invoicing & Payment Settlements',
      'Admin Account Provisioning',
      'Audit Trail Access',
    ],
  },
  {
    name: 'BILLING_ADMIN',
    badge: 'Financial Control',
    description:
      'Authorized to manage subscription plans, issue invoices, settle payments, and export revenue recognition reports.',
    modules: [
      'Subscription Management',
      'Invoice Creation & Dispatch',
      'Payment Recording',
      'Financial Analytics Access',
      'Companies Read Access',
    ],
  },
  {
    name: 'SUPPORT_ADMIN',
    badge: 'Operations & Triage',
    description:
      'Operational administrator responsible for tenant assistance, temporary grace periods, and resource quota reviews.',
    modules: [
      'Companies Management & Status',
      'Grace Period Extensions',
      'Resource Usage Monitoring',
      'Audit Log Inspection',
    ],
  },
  {
    name: 'VIEWER',
    badge: 'Read Only',
    description:
      'Strictly read-only visibility into company directories, usage statistics, and subscription statuses without mutation capabilities.',
    modules: [
      'Companies Directory (Read-only)',
      'Fleet Resource Usage (Read-only)',
      'Plans Directory (Read-only)',
    ],
  },
];

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Role-Based Access Control (RBAC)"
        description="Permission boundaries defining operational authority for internal administrators."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ROLES_INFO.map((role) => (
          <Card key={role.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-400" />
                  <CardTitle className="font-mono text-sm">{role.name}</CardTitle>
                </div>
                <Badge variant="default">{role.badge}</Badge>
              </div>
              <CardDescription className="mt-1">{role.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Permitted Capabilities
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {role.modules.map((mod) => (
                  <li key={mod} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>{mod}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
