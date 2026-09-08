import * as React from 'react';
import { MetricsService } from '@/server/services/metrics.service';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard } from '@/components/charts/metric-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CompanyStatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatters';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const metrics = await MetricsService.getDashboardMetrics();
  const activity = await MetricsService.getRecentActivity();

  return (
    <div className="space-y-6">
      {/* Page Title & Context */}
      <PageHeader
        title="Executive Control Overview"
        description="Real-time multi-tenant health, subscription financials, and operational limit monitoring across all customer companies."
        actions={
          <Link href="/companies">
            <Button variant="secondary" size="sm">
              <Building2 className="h-4 w-4" />
              Manage Companies
            </Button>
          </Link>
        }
      />

      {/* Primary Tenancy & Revenue Metrics */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Company & Subscription Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Companies"
            value={formatNumber(metrics.totalCompanies)}
            subValue={`${metrics.trialCompanies} on trial, ${metrics.suspendedCompanies} suspended`}
            icon={<Building2 className="h-4 w-4" />}
          />
          <MetricCard
            label="Active Companies"
            value={formatNumber(metrics.activeCompanies)}
            subValue="Operating within approved limits"
            icon={<CheckCircle2 className="h-4 w-4" />}
            variant="success"
          />
          <MetricCard
            label="Paying Companies"
            value={formatNumber(metrics.payingCompanies)}
            subValue="Active paid subscriptions"
            icon={<CreditCard className="h-4 w-4" />}
          />
          <MetricCard
            label="Monthly Recurring Rev (MRR)"
            value={formatCurrency(metrics.mrr, metrics.currency)}
            subValue="Normalized monthly billing"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* Financial Realization Section */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Financial Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Total Amount Received"
            value={formatCurrency(metrics.totalAmountReceived, metrics.currency)}
            subValue="Lifetime collected revenue"
            icon={<Wallet className="h-4 w-4" />}
            variant="success"
          />
          <MetricCard
            label="Total Amount Due"
            value={formatCurrency(metrics.totalAmountDue, metrics.currency)}
            subValue="Pending and open invoices"
            icon={<Clock className="h-4 w-4" />}
          />
          <MetricCard
            label="Total Overdue Amount"
            value={formatCurrency(metrics.overdueAmount, metrics.currency)}
            subValue="Past due invoice balances"
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={metrics.overdueAmount > 0 ? 'danger' : 'default'}
          />
        </div>
      </section>

      {/* Operational Grid: Limits, Overdue Invoices, Recent Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recently Created Companies */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Customer Companies</CardTitle>
            <Link
              href="/companies"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {activity.recentCompanies.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Building2 className="h-5 w-5" />}
                  title="No companies onboarded yet"
                  description="When customer companies are created or provisioned, they will appear here."
                  action={
                    <Link href="/companies">
                      <Button size="sm">Create First Company</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {activity.recentCompanies.map((comp) => (
                  <Link
                    key={comp.id}
                    href={`/companies/${comp.id}`}
                    className="flex items-center justify-between p-4 hover:bg-zinc-800/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">
                          {comp.name}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {comp.internalCode}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {comp.contactEmail} • Plan: {comp.subscriptions[0]?.plan?.name || 'Unassigned'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <CompanyStatusBadge status={comp.status as any} />
                      <span className="text-xs text-zinc-500 font-mono">
                        {formatDate(comp.createdAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Invoices & Collection Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Overdue Invoices Requiring Action</CardTitle>
            <Link
              href="/billing/invoices"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              All Invoices <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {activity.overdueInvoices.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
                  title="No overdue accounts"
                  description="All customer invoices are settled or within their payment terms."
                />
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {activity.overdueInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-4 hover:bg-zinc-800/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">
                          {inv.company.name}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {inv.invoiceNumber}
                        </span>
                      </div>
                      <div className="text-xs text-rose-400 mt-0.5 font-mono">
                        Due: {formatDate(inv.dueDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold font-mono text-rose-400">
                        {formatCurrency(inv.amountDue, inv.currency)}
                      </div>
                      <span className="text-[10px] text-zinc-500">Unpaid balance</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
