import { randomUUID } from 'crypto';
import { SyncDirection, SyncStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import {
  SeeakkIntegrationError,
  SeeakkValidationError,
  SeeakkServerError,
  redactSecrets,
} from '@/lib/seeakk-client/errors';
import {
  ApprovePaymentInput,
  RejectPaymentInput,
  LockCompanyInput,
  UnlockCompanyInput,
  SuspendCompanyInput,
  UnsuspendCompanyInput,
  GrantGraceInput,
  RevokeGraceInput,
  SeeakkActionResponse,
} from '@/lib/seeakk-client/contracts';

/**
 * Sanitizes objects before persisting into SystemSyncLog database JSON columns.
 * Recursively redacts any sensitive keys or strings.
 */
export function sanitizePayloadForStorage(payload: unknown): Prisma.InputJsonValue {
  if (payload === null || payload === undefined) {
    return null as unknown as Prisma.InputJsonValue;
  }
  if (typeof payload === 'string') {
    return redactSecrets(payload);
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayloadForStorage(item)) as unknown as Prisma.InputJsonValue;
  }
  if (typeof payload === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('auth')
      ) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizePayloadForStorage(val);
      }
    }
    return sanitizedObj as unknown as Prisma.InputJsonValue;
  }
  return String(payload);
}

export interface SyncMutationResult<T> {
  success: boolean;
  data: T;
  syncLogId: string;
  idempotencyKey: string;
  alreadyExecuted: boolean;
}

export interface ExecuteMutationOptions<TInput, TOutput> {
  idempotencyKey: string;
  eventType: string;
  workspaceId?: string;
  companyId?: string;
  requestPayload: TInput;
  action: (client: SeeakkApiClient, correlationId: string) => Promise<TOutput>;
  env?: string;
}

export class SeeakkSyncService {
  private readonly defaultClient?: SeeakkApiClient;

  constructor(client?: SeeakkApiClient) {
    this.defaultClient = client;
  }

  /**
   * Generic outbound mutation wrapper with deterministic idempotency,
   * SystemSyncLog audit tracking, and secret-scrubbed persistence.
   */
  public async executeOutboundMutation<TInput, TOutput>(
    options: ExecuteMutationOptions<TInput, TOutput>
  ): Promise<SyncMutationResult<TOutput>> {
    const {
      idempotencyKey,
      eventType,
      workspaceId,
      companyId,
      requestPayload,
      action,
      env,
    } = options;

    const correlationId = `sync_${randomUUID()}`;
    const sanitizedRequest = sanitizePayloadForStorage(requestPayload);

    // 1. Check if a SystemSyncLog already exists for this idempotency key
    let syncLog = await prisma.systemSyncLog.findUnique({
      where: { idempotencyKey },
    });

    if (syncLog) {
      // If already succeeded, return existing result without re-executing
      if (syncLog.status === SyncStatus.SUCCESS) {
        return {
          success: true,
          data: (syncLog.responsePayload as unknown as TOutput) || ({} as TOutput),
          syncLogId: syncLog.id,
          idempotencyKey,
          alreadyExecuted: true,
        };
      }

      // If pending and recent (in-flight under 15s), prevent concurrent duplicate dispatch
      const timeSinceLastAttempt = Date.now() - syncLog.lastAttemptAt.getTime();
      if (syncLog.status === SyncStatus.PENDING && timeSinceLastAttempt < 15000) {
        throw new SeeakkValidationError(
          `Operation is currently in-flight to prevent duplicate execution (idempotency key: ${idempotencyKey}).`,
          undefined,
          correlationId
        );
      }

      // If failed or stale pending, record retry attempt
      syncLog = await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.PENDING,
          retryCount: { increment: 1 },
          lastAttemptAt: new Date(),
          requestPayload: sanitizedRequest,
        },
      });
    } else {
      // Create initial PENDING sync log record
      syncLog = await prisma.systemSyncLog.create({
        data: {
          idempotencyKey,
          direction: SyncDirection.OUTBOUND_TO_SEEAKK,
          eventType,
          workspaceId,
          companyId,
          requestPayload: sanitizedRequest,
          status: SyncStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
        },
      });
    }

    const client = this.defaultClient || (env ? new SeeakkApiClient(env) : new SeeakkApiClient());

    try {
      // 2. Perform the actual remote API call
      const result = await action(client, correlationId);

      const sanitizedResponse = sanitizePayloadForStorage(result);

      // 3. Mark sync log as SUCCESS
      await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.SUCCESS,
          responsePayload: sanitizedResponse,
          statusCode: 200,
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        data: result,
        syncLogId: syncLog.id,
        idempotencyKey,
        alreadyExecuted: false,
      };
    } catch (err: any) {
      const statusCode = err instanceof SeeakkIntegrationError ? err.statusCode : 500;
      const sanitizedError = redactSecrets(err.message || 'Unknown synchronization error');

      // 4. Update sync log with failure info
      await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          statusCode,
          errorMessage: sanitizedError,
          updatedAt: new Date(),
        },
      });

      // Rethrow typed integration error
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // SPECIFIC OUTBOUND COORDINATION METHODS
  // ---------------------------------------------------------------------------

  /**
   * Approves a payment request with idempotency protection.
   */
  public async approvePayment(
    paymentRequestId: string,
    body: ApprovePaymentInput,
    options?: { companyId?: string; workspaceId?: string; env?: string; idempotencyKey?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const environment = options?.env || 'TEST';
    const idempotencyKey =
      options?.idempotencyKey || `payment_approve_${environment}_${paymentRequestId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'payment.approved',
      workspaceId: options?.workspaceId,
      companyId: options?.companyId,
      requestPayload: body,
      env: environment,
      action: (client, correlationId) =>
        client.approvePayment(paymentRequestId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Rejects a payment request with idempotency protection.
   */
  public async rejectPayment(
    paymentRequestId: string,
    body: RejectPaymentInput,
    options?: { companyId?: string; workspaceId?: string; env?: string; idempotencyKey?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const environment = options?.env || 'TEST';
    const idempotencyKey =
      options?.idempotencyKey || `payment_reject_${environment}_${paymentRequestId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'payment.rejected',
      workspaceId: options?.workspaceId,
      companyId: options?.companyId,
      requestPayload: body,
      env: environment,
      action: (client, correlationId) =>
        client.rejectPayment(paymentRequestId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Locks a company workspace.
   */
  public async lockCompany(
    companyId: string,
    body: LockCompanyInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_lock_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.locked',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.lockCompany(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Unlocks a company workspace.
   */
  public async unlockCompany(
    companyId: string,
    body: UnlockCompanyInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_unlock_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.unlocked',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.unlockCompany(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Suspends a company workspace.
   */
  public async suspendCompany(
    companyId: string,
    body: SuspendCompanyInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_suspend_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.suspended',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.suspendCompany(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Unsuspends a company workspace.
   */
  public async unsuspendCompany(
    companyId: string,
    body: UnsuspendCompanyInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_unsuspend_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.unsuspended',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.unsuspendCompany(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Grants a grace period to a company.
   */
  public async grantGrace(
    companyId: string,
    body: GrantGraceInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_grace_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.grace_granted',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.grantGrace(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Revokes a grace period from a company.
   */
  public async revokeGrace(
    companyId: string,
    body: RevokeGraceInput,
    options?: { workspaceId?: string; env?: string; operationId?: string }
  ): Promise<SyncMutationResult<SeeakkActionResponse>> {
    const opId = options?.operationId || Date.now();
    const idempotencyKey = `comp_revoke_grace_${companyId}_${opId}`;

    return this.executeOutboundMutation({
      idempotencyKey,
      eventType: 'company.grace_revoked',
      workspaceId: options?.workspaceId,
      companyId,
      requestPayload: body,
      env: options?.env,
      action: (client, correlationId) =>
        client.revokeGrace(options?.workspaceId || companyId, body, { correlationId, idempotencyKey }),
    });
  }

  /**
   * Retrieves the sync status and history for a given idempotency key.
   */
  public async getSyncStatus(idempotencyKey: string) {
    return prisma.systemSyncLog.findUnique({
      where: { idempotencyKey },
    });
  }
}
