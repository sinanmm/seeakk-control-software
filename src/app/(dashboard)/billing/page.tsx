import * as React from 'react';
import { BillingService, InvoiceListItemDTO } from '@/server/services/billing.service';
import { PaymentDTO } from '@/types/billing';
import { MetricsService } from '@/server/services/metrics.service';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard } from '@/components/charts/metric-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { InvoiceStatusBadge, PaymentStatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import Link from 'next/link';
import { Wallet, Clock, AlertTriangle, ArrowUpRight, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const [metrics, invoices, payments]: [any, InvoiceListItemDTO[], PaymentDTO[]] = await Promise.all([
    MetricsService.getDashboardMetrics(),
    BillingService.getInvoices(10),
    BillingService.getPayments(10),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Revenue Realization"
        description="Comprehensive financial management of customer subscription invoices, payment settlements, and collections."
        actions={
          <Link href="/billing/invoices">
            <Button variant="secondary" size="sm">
              <Receipt className="h-4 w-4 mr-1.5" />
              All Invoices
            </Button>
          </Link>
        }
      />

      {/* Financial Realization Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Amount Received"
          value={formatCurrency(metrics.totalAmountReceived, metrics.currency)}
          subValue="Total settled receipts"
          icon={<Wallet className="h-4 w-4" />}
          variant="success"
        />
        <MetricCard
          label="Total Amount Due"
          value={formatCurrency(metrics.totalAmountDue, metrics.currency)}
          subValue="Open balance receivable"
          icon={<Clock className="h-4 w-4" />}
        />
        <MetricCard
          label="Overdue Receivables"
          value={formatCurrency(metrics.overdueAmount, metrics.currency)}
          subValue="Past due invoice balance"
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={metrics.overdueAmount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
            <Link
              href="/billing/invoices"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Receipt className="h-5 w-5" />}
                  title="No invoices generated yet"
                  description="Invoices issued to customer companies will be logged here."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold text-zinc-100">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/companies/${inv.companyId}`}
                          className="text-xs font-medium text-zinc-200 hover:text-indigo-400"
                        >
                          {inv.companyName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatCurrency(inv.totalAmount, inv.currency)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments Received</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Wallet className="h-5 w-5" />}
                  title="No payments recorded yet"
                  description="Settled transactions and recorded payments will appear here."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono text-zinc-400">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/companies/${p.companyId}`}
                          className="text-xs font-medium text-zinc-200 hover:text-indigo-400"
                        >
                          {p.companyName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-emerald-400">
                        {formatCurrency(p.amount, p.currency)}
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-zinc-400">
                        {p.paymentMethod}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
