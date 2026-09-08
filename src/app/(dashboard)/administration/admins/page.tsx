import * as React from 'react';
import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { Users, Shield } from 'lucide-react';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type AdminWithRole = Prisma.AdminUserGetPayload<{ include: { role: true } }>;

export default async function AdminsPage() {
  const admins = await safeDbQuery<AdminWithRole[]>(
    () =>
      prisma.adminUser.findMany({
        orderBy: { createdAt: 'desc' },
        include: { role: true },
      }),
    [] as AdminWithRole[]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control Administrator Accounts"
        description="Authorized platform administrators with role-based access rights to the SEEAKK Control Software."
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Administrator</TableHead>
              <TableHead>Assigned Role</TableHead>
              <TableHead>Account Status</TableHead>
              <TableHead>Last Session Activity</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-zinc-400">
                  No admin users found in database. The default system administrator will be created upon first migration/seed.
                </TableCell>
              </TableRow>
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>
                    <div className="font-semibold text-zinc-100">{admin.name}</div>
                    <div className="text-xs font-mono text-zinc-400">{admin.email}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                      <Shield className="h-3 w-3" />
                      {admin.role.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={admin.isActive ? 'success' : 'danger'}>
                      {admin.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'Never'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {formatDate(admin.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
