import * as React from 'react';
import { BillingService, InvoiceListItemDTO } from '@/server/services/billing.service';
import { PageHeader } from '@/components/layout/page-header';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import Link from 'next/link';
import { Receipt, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const invoices: InvoiceListItemDTO[] = await BillingService.getInvoices(100);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/billing">
          <Button variant="ghost" size="sm" className="-ml-3 text-zinc-400">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Billing Overview
          </Button>
        </Link>
      </div>

      <PageHeader
        title="Customer Invoices Directory"
        description="Master ledger of all subscription and custom invoices generated across tenants."
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No invoices found"
              description="Invoices created manually or generated via recurring billing cycles will be tracked here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Amount Paid</TableHead>
                <TableHead>Amount Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: InvoiceListItemDTO) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs font-semibold text-zinc-100">
                    {inv.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/companies/${inv.companyId}`}
                      className="font-medium text-zinc-200 hover:text-indigo-400"
                    >
                      {inv.companyName}
                    </Link>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {inv.companyCode}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {formatDate(inv.invoiceDate)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold">
                    {formatCurrency(inv.totalAmount, inv.currency)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-emerald-400">
                    {formatCurrency(inv.amountPaid, inv.currency)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-rose-400 font-semibold">
                    {formatCurrency(inv.amountDue, inv.currency)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/companies/${inv.companyId}`}>
                      <Button variant="secondary" size="sm">
                        Inspect
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
