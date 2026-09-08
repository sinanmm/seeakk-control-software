import * as React from 'react';
import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import Link from 'next/link';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const subscriptions = await safeDbQuery(
    () =>
      prisma.subscription.findMany({
        orderBy: { currentPeriodEnd: 'asc' },
        include: {
          company: { select: { id: true, name: true, internalCode: true } },
          plan: true,
        },
      }),
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Subscriptions"
        description="Active contract terms, recurring cycles, renewal milestones, and plan tier allocations."
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {subscriptions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Repeat className="h-6 w-6" />}
              title="No active subscriptions found"
              description="When customer companies are created and assigned plans, their subscription terms will be displayed here."
              action={
                <Link href="/companies">
                  <Button size="sm">Go to Companies</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Current Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <Link
                      href={`/companies/${sub.company.id}`}
                      className="font-medium text-zinc-100 hover:text-indigo-400"
                    >
                      {sub.company.name}
                    </Link>
                    <div className="text-[11px] font-mono text-zinc-500">
                      {sub.company.internalCode}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-zinc-200">
                    {sub.plan.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-300">
                    {formatCurrency(sub.plan.price, sub.plan.currency)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400 uppercase">
                    {sub.plan.billingInterval}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {formatDate(sub.currentPeriodStart)} → {formatDate(sub.currentPeriodEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sub.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/companies/${sub.company.id}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
