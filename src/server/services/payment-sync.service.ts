import { randomUUID } from 'crypto';
import { Environment, PaymentRequestStatus, SyncDirection, SyncStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import {
  SeeakkPaymentRequestItem,
  SeeakkPaymentRequestListResponseSchema,
} from '@/lib/seeakk-client/contracts';
import { SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';
import { sanitizePayloadForStorage } from '@/server/services/seeakk-sync.service';

export interface PaymentSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  total: number;
}

export interface PaymentSyncOptions {
  client?: SeeakkApiClient;
  force?: boolean;
}

/**
 * Maps raw SEEAKK payment status to Control PaymentRequestStatus.
 */
export function mapSeeakkPaymentStatusToControlStatus(remoteStatus: string): PaymentRequestStatus {
  const normalized = remoteStatus.trim().toUpperCase();
  switch (normalized) {
    case 'APPROVED':
      return PaymentRequestStatus.APPROVED;
    case 'REJECTED':
      return PaymentRequestStatus.REJECTED;
    case 'UNDER_REVIEW':
    case 'PAYMENT_SUBMITTED':
      return PaymentRequestStatus.UNDER_REVIEW;
    case 'PAYMENT_REQUIRED':
    case 'PENDING':
    default:
      return PaymentRequestStatus.PENDING;
  }
}

export class PaymentSyncService {
  /**
   * Synchronizes payment requests for an environment from SEEAKK TEST/STAGING/PRODUCTION.
   * Paginates all pages, preserves Control-owned review records, and prevents concurrent jobs.
   */
  public static async syncSeeakkPaymentRequests(
    environmentInput: Environment | string = 'TEST',
    options?: PaymentSyncOptions
  ): Promise<PaymentSyncSummary> {
    const environment = (
      typeof environmentInput === 'string' ? environmentInput.toUpperCase() : environmentInput
    ) as Environment;

    const eventType = `payment_requests.sync.${environment}`;
    const correlationId = `ctrl_sync_pay_${environment}_${randomUUID()}`;
    const now = new Date();

    // 1. Prevent concurrent duplicate sync jobs within 120 seconds unless forced
    if (!options?.force) {
      const activeSync = await prisma.systemSyncLog.findFirst({
        where: {
          eventType,
          direction: SyncDirection.INBOUND_FROM_SEEAKK,
          status: SyncStatus.PENDING,
          createdAt: {
            gte: new Date(Date.now() - 120 * 1000),
          },
        },
      });

      if (activeSync) {
        throw new Error(
          `A payment request synchronization for environment ${environment} is currently in progress (ID: ${activeSync.id}). Please wait for it to complete.`
        );
      }
    }

    const idempotencyKey = `pay_req_sync_${environment}_${Date.now()}`;

    // 2. Initialize sync execution log
    const syncLog = await prisma.systemSyncLog.create({
      data: {
        idempotencyKey,
        direction: SyncDirection.INBOUND_FROM_SEEAKK,
        eventType,
        status: SyncStatus.PENDING,
        requestPayload: { correlationId, environment, triggeredAt: now.toISOString() },
      },
    });

    const client = options?.client || new SeeakkApiClient(environment);

    const summary: PaymentSyncSummary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      total: 0,
    };

    try {
      let currentPage = 1;
      let totalPages = 1;
      const pageSize = 50;

      // 3. Paginate through all remote pages
      do {
        const rawResponse = await client.getPaymentRequests({
          page: currentPage,
          limit: pageSize,
        });

        const validated = SeeakkPaymentRequestListResponseSchema.parse(rawResponse);
        totalPages = validated.pagination.totalPages || 1;

        for (const item of validated.items) {
          summary.total++;
          try {
            await this.upsertSinglePaymentRequest(item, environment, summary);
          } catch (itemErr: any) {
            summary.failed++;
            console.error(
              `[PaymentSyncService] Failed to process payment request ${item.paymentRequestId || item.id}:`,
              redactSecrets(itemErr?.message || String(itemErr))
            );
          }
        }

        currentPage++;
      } while (currentPage <= totalPages);

      // 4. Update sync log on success
      await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: summary.failed > 0 && summary.created === 0 && summary.updated === 0 ? SyncStatus.FAILED : SyncStatus.SUCCESS,
          statusCode: 200,
          responsePayload: sanitizePayloadForStorage(summary),
          updatedAt: new Date(),
        },
      });

      return summary;
    } catch (err: any) {
      await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          statusCode: err.statusCode || 500,
          errorMessage: redactSecrets(err.message || 'Payment requests sync failed'),
          updatedAt: new Date(),
        },
      });

      if (err instanceof SeeakkIntegrationError) {
        throw err;
      }
      throw new Error(`Payment request synchronization failed: ${redactSecrets(err.message)}`);
    }
  }

  /**
   * Safely upserts a single payment request into Control Software,
   * respecting environment isolation and preserving Control-owned review fields.
   */
  private static async upsertSinglePaymentRequest(
    item: SeeakkPaymentRequestItem,
    environment: Environment,
    summary: PaymentSyncSummary
  ): Promise<void> {
    const seeakkPaymentId = item.paymentRequestId || item.id;
    if (!seeakkPaymentId) {
      throw new Error('Payment request item missing both paymentRequestId and id');
    }

    const workspaceId = item.workspaceId;
    if (!workspaceId) {
      throw new Error(`Payment request ${seeakkPaymentId} missing workspaceId`);
    }

    // 1. Resolve Company in Control for this workspaceId + environment
    let company = await prisma.company.findUnique({
      where: {
        workspaceId_environment: {
          workspaceId,
          environment,
        },
      },
    });

    if (!company) {
      // Find company by workspaceId fallback or create a reference company shell
      const existingCompanyByWorkspace = await prisma.company.findFirst({
        where: { workspaceId },
      });

      if (existingCompanyByWorkspace && existingCompanyByWorkspace.environment === environment) {
        company = existingCompanyByWorkspace;
      } else {
        const companyName =
          item.companyName ||
          item.workspace?.companyName ||
          item.company?.companyName ||
          `Company ${workspaceId.slice(0, 8)}`;

        company = await prisma.company.create({
          data: {
            workspaceId,
            environment,
            internalCode: `CMP_${workspaceId.slice(0, 8).toUpperCase()}_${environment}`,
            name: companyName,
            slug: `${workspaceId.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${environment.toLowerCase()}`,
            contactEmail: `${workspaceId.toLowerCase()}@seeakk.customer`,
          },
        });
      }
    }

    // 2. Resolve Plan
    const planCode = item.requestedPlan?.code || item.planCodeSnapshot || 'STARTER';
    let plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan) {
      plan = await prisma.plan.findFirst();
      if (!plan) {
        throw new Error(`No Plan found in Control Software to link payment request ${seeakkPaymentId}`);
      }
    }

    // 3. Extract remote fields
    const amount = item.calculatedAmount ?? item.amount ?? 0;
    const currency = item.currency || 'INR';
    const billingCycle = item.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const paymentReference = item.paymentReference || null;
    const requestedUsers = item.requestedUsers ?? null;
    const requestedMonths = item.requestedMonths ?? null;
    const unitPrice = item.unitPrice ?? null;
    const remoteStatus = item.status;
    const mappedControlStatus = mapSeeakkPaymentStatusToControlStatus(remoteStatus);

    const submission = item.submission || (item.paymentSubmissions && item.paymentSubmissions[0]);
    const transactionRef =
      submission?.utrNumber || submission?.transactionReference || null;
    const proofFileKey = submission?.proofStorageKey || (submission?.proofAvailable ? 'available' : null);
    const proofFileMime = proofFileKey?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    const notes = submission?.remarks || null;

    let submittedAt: Date | null = null;
    if (submission?.submittedAt) {
      submittedAt = new Date(submission.submittedAt);
    } else if (item.submittedAt) {
      submittedAt = new Date(item.submittedAt);
    }

    let paymentDate: Date | null = null;
    if (submission?.paymentDate) {
      paymentDate = new Date(submission.paymentDate);
    }

    const sanitizedPayload = sanitizePayloadForStorage(item);

    // 4. Check for existing Control record
    const existing = await prisma.paymentProofRequest.findUnique({
      where: {
        seeakkPaymentId_environment: {
          seeakkPaymentId,
          environment,
        },
      },
    });

    if (!existing) {
      // Create new Control record
      await prisma.paymentProofRequest.create({
        data: {
          seeakkPaymentId,
          workspaceId,
          environment,
          companyId: company.id,
          planId: plan.id,
          amount,
          currency,
          billingCycle,
          transactionRef,
          proofFileKey,
          proofFileMime,
          requestedUsers,
          requestedMonths,
          unitPrice,
          paymentReference,
          remoteStatus,
          status: mappedControlStatus,
          notes,
          submittedAt,
          paymentDate,
          rawPayload: sanitizedPayload,
        },
      });
      summary.created++;
    } else {
      // PRESERVE Control-owned review fields!
      // If Control has already approved or rejected this request locally,
      // preserve local decision unless remote confirms APPROVED/REJECTED.
      const shouldPreserveLocalStatus =
        existing.status === PaymentRequestStatus.APPROVED ||
        existing.status === PaymentRequestStatus.REJECTED;

      const finalStatus = shouldPreserveLocalStatus ? existing.status : mappedControlStatus;

      await prisma.paymentProofRequest.update({
        where: { id: existing.id },
        data: {
          companyId: company.id,
          planId: plan.id,
          amount,
          currency,
          billingCycle,
          transactionRef: transactionRef ?? existing.transactionRef,
          proofFileKey: proofFileKey ?? existing.proofFileKey,
          proofFileMime: proofFileMime ?? existing.proofFileMime,
          requestedUsers: requestedUsers ?? existing.requestedUsers,
          requestedMonths: requestedMonths ?? existing.requestedMonths,
          unitPrice: unitPrice ?? existing.unitPrice,
          paymentReference: paymentReference ?? existing.paymentReference,
          remoteStatus,
          status: finalStatus,
          notes: notes ?? existing.notes,
          submittedAt: submittedAt ?? existing.submittedAt,
          paymentDate: paymentDate ?? existing.paymentDate,
          rawPayload: sanitizedPayload,
          // Reviewed fields are strictly preserved from existing record
          reviewedByAdminId: existing.reviewedByAdminId,
          reviewedAt: existing.reviewedAt,
          rejectionReason: existing.rejectionReason,
          approvedEntitlements: existing.approvedEntitlements as Prisma.InputJsonValue,
          invoiceId: existing.invoiceId,
        },
      });
      summary.updated++;
    }
  }
}
