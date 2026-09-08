import * as React from 'react';
import { CompanyService, CompanyListResult } from '@/server/services/company.service';
import { CompanySummaryDTO } from '@/types/company';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';
import Link from 'next/link';
import { Gauge, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const result: CompanyListResult = await CompanyService.getCompanies({ pageSize: 50 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Usage & Resource Consumption"
        description="Global cross-tenant monitoring of customer seats, lead capacity, batch imports, and database storage."
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Gauge className="h-6 w-6" />}
              title="No usage records found"
              description="As companies use resources, their consumption against active limits will appear here."
              action={
                <Link href="/companies">
                  <Button size="sm">Create Company</Button>
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
                <TableHead>Users Quota</TableHead>
                <TableHead>Leads Quota</TableHead>
                <TableHead>Health State</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((comp: CompanySummaryDTO) => {
                const userPct = comp.usersLimit > 0 ? (comp.usersUsed / comp.usersLimit) * 100 : 0;
                const leadPct = comp.leadsLimit > 0 ? (comp.leadsUsed / comp.leadsLimit) * 100 : 0;
                const isNearLimit = userPct >= 80 || leadPct >= 80;

                return (
                  <TableRow key={comp.id}>
                    <TableCell>
                      <Link
                        href={`/companies/${comp.id}`}
                        className="font-medium text-zinc-100 hover:text-indigo-400"
                      >
                        {comp.name}
                      </Link>
                      <div className="text-[11px] font-mono text-zinc-500">
                        {comp.internalCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-300">
                      {comp.currentPlanName}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-zinc-200">
                        {formatNumber(comp.usersUsed)} / {formatNumber(comp.usersLimit)}
                      </div>
                      <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            userPct >= 100
                              ? 'bg-rose-500'
                              : userPct >= 80
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, userPct))}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-zinc-200">
                        {formatNumber(comp.leadsUsed)} / {formatNumber(comp.leadsLimit)}
                      </div>
                      <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            leadPct >= 100
                              ? 'bg-rose-500'
                              : leadPct >= 80
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, leadPct))}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {isNearLimit ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" /> High Usage
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">Normal</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/companies/${comp.id}`}>
                        <Button variant="secondary" size="sm">
                          Configure Limits
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
