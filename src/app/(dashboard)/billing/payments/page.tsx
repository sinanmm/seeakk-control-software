import * as React from 'react';
import { prisma } from '@/lib/db/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { PaymentRequestsTable } from '@/features/payments/components/payment-requests-table';
import { PaymentProofRequestDTO } from '@/types/billing';
import Link from 'next/link';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function PaymentRequestsPage() {
  const records = await prisma.paymentProofRequest.findMany({
    include: {
      company: {
        select: {
          id: true,
          name: true,
          workspaceId: true,
          environment: true,
        },
      },
      plan: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const payments: PaymentProofRequestDTO[] = records.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.company?.name || 'Unknown Company',
    workspaceId: r.workspaceId,
    environment: r.environment as any,
    seeakkPaymentId: r.seeakkPaymentId,
    paymentReference: r.paymentReference,
    planId: r.planId,
    planName: r.plan?.name || 'Base Plan',
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billingCycle as any,
    transactionRef: r.transactionRef,
    proofFileKey: r.proofFileKey,
    proofFileMime: r.proofFileMime,
    requestedUsers: r.requestedUsers,
    requestedMonths: r.requestedMonths,
    unitPrice: r.unitPrice,
    remoteStatus: r.remoteStatus,
    paymentDate: r.paymentDate,
    submittedAt: r.submittedAt,
    notes: r.notes,
    status: r.status as any,
    reviewedByAdminId: r.reviewedByAdminId,
    reviewedAt: r.reviewedAt,
    rejectionReason: r.rejectionReason,
    approvedEntitlements: r.approvedEntitlements,
    invoiceId: r.invoiceId,
    rawPayload: r.rawPayload,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/billing">
          <Button variant="ghost" size="sm" className="-ml-3 text-zinc-400">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Billing Overview
          </Button>
        </Link>
        <Link href="/billing/invoices">
          <Button variant="secondary" size="sm">
            <Receipt className="h-4 w-4 mr-1.5" />
            All Invoices
          </Button>
        </Link>
      </div>

      <PageHeader
        title="Offline Payment Proof Review & Approval"
        description="Verify manual bank wire and UPI payment proofs submitted from SEEAKK customer workspaces. Approve access to activate user seats and plans."
      />

      <PaymentRequestsTable payments={payments} />
    </div>
  );
}
