'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { assertPermission } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { SeeakkSyncService } from '@/server/services/seeakk-sync.service';
import { PaymentSyncService, PaymentSyncSummary } from '@/server/services/payment-sync.service';
import { AuditService } from '@/server/services/audit.service';
import {
  approvePaymentSchema,
  rejectPaymentSchema,
  syncPaymentRequestsSchema,
} from '@/lib/validation/schemas';
import { Environment, PaymentRequestStatus, AuditAction } from '@prisma/client';
import { SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';

function getSyncService(env?: Environment | string) {
  return new SeeakkSyncService(new SeeakkApiClient(env));
}

export interface ActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Server action: Synchronizes payment requests from SEEAKK TEST/STAGING/PRODUCTION.
 */
export async function syncPaymentRequestsAction(
  formData: FormData
): Promise<ActionResponse<PaymentSyncSummary>> {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }
    assertPermission(session, 'payments:review');

    const rawEnvironment = (formData.get('environment') as string) || 'TEST';
    const parsed = syncPaymentRequestsSchema.safeParse({ environment: rawEnvironment });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid environment specified',
      };
    }

    const summary = await PaymentSyncService.syncSeeakkPaymentRequests(parsed.data.environment);

    await AuditService.record({
      adminEmail: session.email,
      action: AuditAction.SYNC_EVENT_TRIGGERED,
      entityType: 'PaymentProofRequest',
      entityId: `sync_${parsed.data.environment}_${Date.now()}`,
      metadata: {
        environment: parsed.data.environment,
        summary,
      },
    });

    revalidatePath('/billing');
    revalidatePath('/billing/payments');

    return {
      success: true,
      message: `Synchronized ${summary.total} payment requests (${summary.created} new, ${summary.updated} updated).`,
      data: summary,
    };
  } catch (err: any) {
    console.error('[syncPaymentRequestsAction] Error:', err);
    return {
      success: false,
      error: redactSecrets(err.message || 'Payment requests synchronization failed'),
    };
  }
}

/**
 * Server action: Approves a payment proof request on SEEAKK and updates Control Software.
 */
export async function approvePaymentAction(formData: FormData): Promise<ActionResponse> {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }
    assertPermission(session, 'payments:review');

    const paymentRequestId = (formData.get('paymentRequestId') as string) || '';
    const approvedUserLimit = formData.get('approvedUserLimit');
    const accessFrom = (formData.get('accessFrom') as string) || '';
    const accessUntil = (formData.get('accessUntil') as string) || '';
    const remarks = (formData.get('remarks') as string) || '';
    const rawEnvironment = (formData.get('environment') as string) || 'TEST';

    const parsed = approvePaymentSchema.safeParse({
      paymentRequestId,
      approvedUserLimit,
      accessFrom,
      accessUntil,
      remarks,
      environment: rawEnvironment,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Validation failed';
      return { success: false, error: firstError };
    }

    const { environment, approvedUserLimit: validLimit, accessFrom: validFrom, accessUntil: validUntil } = parsed.data;

    // 1. Locate local record in Control
    const existing = await prisma.paymentProofRequest.findFirst({
      where: {
        OR: [
          { seeakkPaymentId: paymentRequestId, environment },
          { id: paymentRequestId },
        ],
      },
      include: {
        company: true,
        plan: true,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: `Payment request ${paymentRequestId} not found in Control Software for ${environment}`,
      };
    }

    if (existing.status === PaymentRequestStatus.APPROVED) {
      return {
        success: false,
        error: 'Payment request is already marked as APPROVED.',
      };
    }

    const seeakkId = existing.seeakkPaymentId;
    const syncService = getSyncService(existing.environment);
    const idempotencyKey = `payment_approve_${existing.environment}_${seeakkId}`;

    // 2. Dispatch approve request to SEEAKK (Control -> SEEAKK approve API)
    const result = await syncService.approvePayment(
      seeakkId,
      {
        approvedUserLimit: validLimit,
        accessFrom: new Date(validFrom).toISOString(),
        accessUntil: new Date(validUntil).toISOString(),
        remarks: remarks || undefined,
        approvedBy: session.email,
      },
      {
        companyId: existing.companyId,
        workspaceId: existing.workspaceId,
        env: existing.environment,
        idempotencyKey,
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: 'SEEAKK rejected the payment approval request.',
      };
    }

    // 3. ONLY after SEEAKK confirms success -> update Control payment state
    const approvedEntitlementsSnapshot = {
      approvedUserLimit: validLimit,
      accessFrom: validFrom,
      accessUntil: validUntil,
      remarks: remarks || null,
      approvedByEmail: session.email,
      approvedAt: new Date().toISOString(),
    };

    const updated = await prisma.paymentProofRequest.update({
      where: { id: existing.id },
      data: {
        status: PaymentRequestStatus.APPROVED,
        remoteStatus: 'APPROVED',
        reviewedByAdminId: session.id,
        reviewedAt: new Date(),
        approvedEntitlements: approvedEntitlementsSnapshot,
      },
    });

    // 4. Write audit record
    await AuditService.record({
      adminEmail: session.email,
      action: AuditAction.PAYMENT_APPROVED,
      entityType: 'PaymentProofRequest',
      entityId: updated.id,
      oldValue: { status: existing.status, remoteStatus: existing.remoteStatus },
      newValue: { status: updated.status, remoteStatus: updated.remoteStatus },
      metadata: {
        paymentRequestId: seeakkId,
        companyId: existing.companyId,
        workspaceId: existing.workspaceId,
        environment: existing.environment,
        approvedUserLimit: validLimit,
        accessFrom: validFrom,
        accessUntil: validUntil,
        remarks,
        idempotencyKey,
      },
    });

    revalidatePath('/billing');
    revalidatePath('/billing/payments');
    revalidatePath(`/companies/${existing.companyId}`);

    return {
      success: true,
      message: 'Payment approved successfully. Workspace access and user limit have been updated on SEEAKK.',
    };
  } catch (err: any) {
    console.error('[approvePaymentAction] Error:', err);
    if (err instanceof SeeakkIntegrationError) {
      return { success: false, error: err.toSafeUserMessage() };
    }
    return {
      success: false,
      error: redactSecrets(err.message || 'Payment approval failed. Please try again.'),
    };
  }
}

/**
 * Server action: Rejects a payment proof request on SEEAKK and updates Control Software.
 */
export async function rejectPaymentAction(formData: FormData): Promise<ActionResponse> {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }
    assertPermission(session, 'payments:review');

    const paymentRequestId = (formData.get('paymentRequestId') as string) || '';
    const reason = (formData.get('reason') as string) || '';
    const remarks = (formData.get('remarks') as string) || '';
    const rawEnvironment = (formData.get('environment') as string) || 'TEST';

    const parsed = rejectPaymentSchema.safeParse({
      paymentRequestId,
      reason,
      remarks,
      environment: rawEnvironment,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Validation failed';
      return { success: false, error: firstError };
    }

    const { environment, reason: validReason } = parsed.data;

    // 1. Locate local record in Control
    const existing = await prisma.paymentProofRequest.findFirst({
      where: {
        OR: [
          { seeakkPaymentId: paymentRequestId, environment },
          { id: paymentRequestId },
        ],
      },
    });

    if (!existing) {
      return {
        success: false,
        error: `Payment request ${paymentRequestId} not found in Control Software for ${environment}`,
      };
    }

    if (existing.status === PaymentRequestStatus.APPROVED) {
      return {
        success: false,
        error: 'Cannot reject a payment request that is already APPROVED.',
      };
    }

    const seeakkId = existing.seeakkPaymentId;
    const syncService = getSyncService(existing.environment);
    const idempotencyKey = `payment_reject_${existing.environment}_${seeakkId}`;

    // 2. Dispatch reject request to SEEAKK
    const result = await syncService.rejectPayment(
      seeakkId,
      {
        reason: validReason,
        remarks: remarks || undefined,
        rejectedBy: session.email,
      },
      {
        companyId: existing.companyId,
        workspaceId: existing.workspaceId,
        env: existing.environment,
        idempotencyKey,
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: 'SEEAKK rejected the payment rejection request.',
      };
    }

    // 3. ONLY after SEEAKK confirms rejection -> update Control payment state
    const updated = await prisma.paymentProofRequest.update({
      where: { id: existing.id },
      data: {
        status: PaymentRequestStatus.REJECTED,
        remoteStatus: 'REJECTED',
        reviewedByAdminId: session.id,
        reviewedAt: new Date(),
        rejectionReason: validReason,
        notes: remarks || existing.notes,
      },
    });

    // 4. Write audit record
    await AuditService.record({
      adminEmail: session.email,
      action: AuditAction.PAYMENT_REJECTED,
      entityType: 'PaymentProofRequest',
      entityId: updated.id,
      oldValue: { status: existing.status, remoteStatus: existing.remoteStatus },
      newValue: { status: updated.status, remoteStatus: updated.remoteStatus },
      metadata: {
        paymentRequestId: seeakkId,
        companyId: existing.companyId,
        workspaceId: existing.workspaceId,
        environment: existing.environment,
        reason: validReason,
        remarks,
        idempotencyKey,
      },
    });

    revalidatePath('/billing');
    revalidatePath('/billing/payments');
    revalidatePath(`/companies/${existing.companyId}`);

    return {
      success: true,
      message: 'Payment proof rejected successfully.',
    };
  } catch (err: any) {
    console.error('[rejectPaymentAction] Error:', err);
    if (err instanceof SeeakkIntegrationError) {
      return { success: false, error: err.toSafeUserMessage() };
    }
    return {
      success: false,
      error: redactSecrets(err.message || 'Payment rejection failed. Please try again.'),
    };
  }
}
