'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CompanyStatusBadge, EnvironmentBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateCompanyModal } from './create-company-modal';
import { SyncCompaniesModal } from './sync-companies-modal';
import { CompanySummaryDTO, Environment } from '@/types/company';
import { PlanDTO } from '@/types/entitlement';
import { formatDate, formatNumber } from '@/lib/utils/formatters';
import { Building2, Search, Plus, ExternalLink, Clock, RefreshCw } from 'lucide-react';

interface CompanyTableViewProps {
  companies: CompanySummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  plans: PlanDTO[];
}

export function CompanyTableView({
  companies,
  total,
  page,
  pageSize,
  totalPages,
  plans,
}: CompanyTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(searchParams.get('search') || '');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput) params.set('search', searchInput);
    else params.delete('search');
    params.set('page', '1');
    router.push(`/companies?${params.toString()}`);
  };

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status);
    else params.delete('status');
    params.set('page', '1');
    router.push(`/companies?${params.toString()}`);
  };

  const handleEnvFilter = (env: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (env) params.set('env', env);
    else params.delete('env');
    params.set('page', '1');
    router.push(`/companies?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/companies?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Action Bar: Search, Filters, Create Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search companies by name, code, email..."
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <div className="w-36">
            <Select
              defaultValue={searchParams.get('status') || ''}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="h-9 text-xs py-1.5"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="GRACE_PERIOD">Grace Period</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>

          <div className="w-32">
            <Select
              defaultValue={searchParams.get('env') || ''}
              onChange={(e) => handleEnvFilter(e.target.value)}
              className="h-9 text-xs py-1.5"
            >
              <option value="">All Envs</option>
              <option value="PRODUCTION">Production</option>
              <option value="STAGING">Staging</option>
              <option value="TEST">Test</option>
            </Select>
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="h-9 gap-1.5"
            onClick={() => setIsSyncModalOpen(true)}
          >
            <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
            Sync from SEEAKK
          </Button>

          <Button size="sm" className="h-9" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New Company
          </Button>
        </div>
      </div>

      {/* Companies Data Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {companies.length === 0 ? (
          <div className="p-10">
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="No customer companies found"
              description={
                searchInput || searchParams.get('status')
                  ? 'No companies match your filter criteria. Try resetting filters.'
                  : 'Get started by provisioning the first customer company in the Control platform.'
              }
              action={
                <Button size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Company
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company & Code</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Seats (Users)</TableHead>
                  <TableHead>Leads Limit</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium text-zinc-100 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
                      >
                        {c.name}
                        <ExternalLink className="h-3 w-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2 mt-0.5">
                        <span>{c.internalCode}</span>
                        {c.workspaceId && <span>• {c.workspaceId}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EnvironmentBadge environment={c.environment} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <CompanyStatusBadge status={c.status} />
                        {c.gracePeriodDaysLeft !== null && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3" />
                            {c.gracePeriodDaysLeft}d grace remaining
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-zinc-200">
                        {c.currentPlanName || 'No Plan'}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {c.subscriptionStatus || 'None'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono text-zinc-300">
                        {formatNumber(c.usersUsed)} / {formatNumber(c.usersLimit)}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {c.usersLimit > 0
                          ? `${Math.round((c.usersUsed / c.usersLimit) * 100)}% utilized`
                          : '0%'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono text-zinc-300">
                        {formatNumber(c.leadsUsed)} / {formatNumber(c.leadsLimit)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400 font-mono">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/companies/${c.id}`}>
                        <Button variant="secondary" size="sm">
                          Inspect
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      <CreateCompanyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        plans={plans}
      />

      <SyncCompaniesModal
        isOpen={isSyncModalOpen}
        onClose={() => {
          setIsSyncModalOpen(false);
          router.refresh();
        }}
        defaultEnvironment={(searchParams.get('env') as any) || 'TEST'}
      />
    </div>
  );
}
