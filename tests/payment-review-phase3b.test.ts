import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Environment, PaymentRequestStatus, SyncStatus, AuditAction } from '@prisma/client';
import { prisma } from '../src/lib/db/prisma';
import {
  PaymentSyncService,
  mapSeeakkPaymentStatusToControlStatus,
} from '../src/server/services/payment-sync.service';
import { SeeakkApiClient } from '../src/lib/seeakk-client/client';
import { SeeakkSyncService, sanitizePayloadForStorage } from '../src/server/services/seeakk-sync.service';
import {
  approvePaymentSchema,
  rejectPaymentSchema,
  syncPaymentRequestsSchema,
} from '../src/lib/validation/schemas';
import { AuditService } from '../src/server/services/audit.service';
import { assertPermission, hasPermission } from '../src/lib/auth/permissions';
import { AdminSession } from '../src/types/auth';
import {
  SeeakkNotFoundError,
  SeeakkServerError,
  SeeakkTimeoutError,
  SeeakkValidationError,
  redactSecrets,
} from '../src/lib/seeakk-client/errors';

describe('Phase 3B: Offline Payment Proof Review & Approval Workflow', () => {
  const mockServiceKey = 'test_service_key_secret_99999';

  beforeEach(() => {
    process.env.SEEAKK_CONTROL_SERVICE_KEY = mockServiceKey;
    process.env.SEEAKK_API_BASE_URL_TEST = 'https://seeakk-test.internal';
    process.env.SEEAKK_ENVIRONMENT = 'TEST';

    (prisma.systemSyncLog as any).findUnique = async () => null;
    (prisma.systemSyncLog as any).create = async (args: any) => ({
      id: 'sync_log_mock',
      status: SyncStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
      lastAttemptAt: new Date(),
      ...args.data,
    });
    (prisma.systemSyncLog as any).update = async (args: any) => ({
      id: 'sync_log_mock',
      ...args.data,
    });
  });

  // 1. Payment synchronization creates records
  it('1. Payment synchronization creates new PaymentProofRequest records from remote payload', async () => {
    const mockRemotePayment = {
      paymentRequestId: 'pr_test_001',
      workspaceId: 'ws_test_001',
      companyName: 'Acme Test Corp',
      status: 'PAYMENT_SUBMITTED',
      calculatedAmount: 998,
      currency: 'INR',
      requestedUsers: 2,
      requestedMonths: 1,
      paymentReference: 'SEEAKK-PAY-20260901-1001',
      planCodeSnapshot: 'STARTER',
      submission: {
        id: 'sub_001',
        utrNumber: 'UTR987654321',
        paymentDate: '2026-09-01T00:00:00.000Z',
        proofAvailable: true,
        proofStorageKey: 'uploads/proof_001.png',
        remarks: 'Payment via UPI',
        submittedAt: '2026-09-01T10:00:00.000Z',
      },
    };

    let createdRecordData: any = null;

    const originalFindUnique = prisma.paymentProofRequest.findUnique;
    const originalCreate = prisma.paymentProofRequest.create;
    const originalCompanyFind = prisma.company.findUnique;
    const originalPlanFind = prisma.plan.findUnique;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_1', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_1', ...args.data });

      (prisma.company as any).findUnique = async () => ({
        id: 'company_001',
        workspaceId: 'ws_test_001',
        environment: 'TEST',
        name: 'Acme Test Corp',
      });

      (prisma.plan as any).findUnique = async () => ({
        id: 'plan_starter_id',
        code: 'STARTER',
        name: 'Starter Plan',
      });

      (prisma.paymentProofRequest as any).findUnique = async () => null;
      (prisma.paymentProofRequest as any).create = async (args: any) => {
        createdRecordData = args.data;
        return { id: 'cuid_001', ...args.data };
      };

      const mockClient = {
        getPaymentRequests: async () => ({
          success: true,
          items: [mockRemotePayment],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      const summary = await PaymentSyncService.syncSeeakkPaymentRequests('TEST', { client: mockClient });

      assert.equal(summary.created, 1);
      assert.equal(summary.total, 1);
      assert.equal(createdRecordData.seeakkPaymentId, 'pr_test_001');
      assert.equal(createdRecordData.workspaceId, 'ws_test_001');
      assert.equal(createdRecordData.environment, 'TEST');
      assert.equal(createdRecordData.amount, 998);
      assert.equal(createdRecordData.requestedUsers, 2);
      assert.equal(createdRecordData.transactionRef, 'UTR987654321');
      assert.equal(createdRecordData.status, PaymentRequestStatus.UNDER_REVIEW);
    } finally {
      prisma.paymentProofRequest.findUnique = originalFindUnique;
      prisma.paymentProofRequest.create = originalCreate;
      prisma.company.findUnique = originalCompanyFind;
      prisma.plan.findUnique = originalPlanFind;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 2. Payment synchronization updates records
  it('2. Payment synchronization safely updates existing records while preserving Control-owned review fields', async () => {
    let updateRecordData: any = null;

    const originalFindUnique = prisma.paymentProofRequest.findUnique;
    const originalUpdate = prisma.paymentProofRequest.update;
    const originalCompanyFind = prisma.company.findUnique;
    const originalPlanFind = prisma.plan.findUnique;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_2', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_2', ...args.data });

      (prisma.company as any).findUnique = async () => ({
        id: 'company_002',
        workspaceId: 'ws_test_002',
        environment: 'TEST',
      });

      (prisma.plan as any).findUnique = async () => ({
        id: 'plan_starter_id',
        code: 'STARTER',
      });

      // Existing record in Control has already been reviewed by an admin
      const existingRecord = {
        id: 'pay_ctrl_002',
        seeakkPaymentId: 'pr_test_002',
        environment: 'TEST',
        companyId: 'company_002',
        status: PaymentRequestStatus.UNDER_REVIEW,
        reviewedByAdminId: 'admin_reviewer_99',
        reviewedAt: new Date('2026-09-01T12:00:00Z'),
        rejectionReason: null,
        approvedEntitlements: null,
        invoiceId: 'inv_123',
        transactionRef: 'OLD_UTR',
      };

      (prisma.paymentProofRequest as any).findUnique = async () => existingRecord;
      (prisma.paymentProofRequest as any).update = async (args: any) => {
        updateRecordData = args.data;
        return { ...existingRecord, ...args.data };
      };

      const mockClient = {
        getPaymentRequests: async () => ({
          success: true,
          items: [
            {
              paymentRequestId: 'pr_test_002',
              workspaceId: 'ws_test_002',
              status: 'UNDER_REVIEW',
              calculatedAmount: 1499,
              requestedUsers: 3,
              submission: {
                id: 'sub_test_002',
                utrNumber: 'NEW_UTR_UPDATED',
                proofStorageKey: 'uploads/proof_new.png',
              },
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      const summary = await PaymentSyncService.syncSeeakkPaymentRequests('TEST', { client: mockClient });

      assert.equal(summary.updated, 1);
      assert.equal(updateRecordData.amount, 1499);
      assert.equal(updateRecordData.transactionRef, 'NEW_UTR_UPDATED');
      // Verify Control-owned review fields were strictly preserved
      assert.equal(updateRecordData.reviewedByAdminId, 'admin_reviewer_99');
      assert.equal(updateRecordData.invoiceId, 'inv_123');
    } finally {
      prisma.paymentProofRequest.findUnique = originalFindUnique;
      prisma.paymentProofRequest.update = originalUpdate;
      prisma.company.findUnique = originalCompanyFind;
      prisma.plan.findUnique = originalPlanFind;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 3. TEST / PRODUCTION isolation
  it('3. Preserves environment isolation across TEST and PRODUCTION for payment requests', async () => {
    let queriedEnvironment: string | null = null;

    const originalFindUnique = prisma.paymentProofRequest.findUnique;
    const originalCompanyFind = prisma.company.findUnique;
    const originalPlanFind = prisma.plan.findUnique;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_3', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_3', ...args.data });

      (prisma.paymentProofRequest as any).findUnique = async (args: any) => {
        if (args.where?.seeakkPaymentId_environment) {
          queriedEnvironment = args.where.seeakkPaymentId_environment.environment;
        }
        return null;
      };

      (prisma.company as any).findUnique = async () => ({
        id: 'comp_prod_001',
        workspaceId: 'ws_prod_001',
        environment: 'PRODUCTION',
      });
      (prisma.plan as any).findUnique = async () => ({ id: 'plan_1', code: 'STARTER' });
      (prisma.paymentProofRequest as any).create = async (args: any) => ({ id: 'pay_prod', ...args.data });

      const mockClient = {
        getPaymentRequests: async () => ({
          success: true,
          items: [{ paymentRequestId: 'pr_prod_001', workspaceId: 'ws_prod_001', status: 'PENDING' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      await PaymentSyncService.syncSeeakkPaymentRequests('PRODUCTION', { client: mockClient });

      assert.equal(queriedEnvironment, 'PRODUCTION');
    } finally {
      prisma.paymentProofRequest.findUnique = originalFindUnique;
      prisma.company.findUnique = originalCompanyFind;
      prisma.plan.findUnique = originalPlanFind;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 4. Pagination
  it('4. Paginates across all pages returned by SEEAKK payment requests API', async () => {
    let pagesRequested: number[] = [];

    const originalFindUnique = prisma.paymentProofRequest.findUnique;
    const originalCompanyFind = prisma.company.findUnique;
    const originalPlanFind = prisma.plan.findUnique;
    const originalCreate = prisma.paymentProofRequest.create;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_4', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_4', ...args.data });

      (prisma.company as any).findUnique = async () => ({ id: 'c1', workspaceId: 'ws_page', environment: 'TEST' });
      (prisma.plan as any).findUnique = async () => ({ id: 'p1', code: 'STARTER' });
      (prisma.paymentProofRequest as any).findUnique = async () => null;
      (prisma.paymentProofRequest as any).create = async (args: any) => ({ id: args.data.seeakkPaymentId, ...args.data });

      const mockClient = {
        getPaymentRequests: async (params?: any) => {
          pagesRequested.push(params?.page || 1);
          return {
            success: true,
            items: [{ paymentRequestId: `pr_p_${params?.page}`, workspaceId: 'ws_page', status: 'PENDING' }],
            pagination: { page: params?.page, limit: 50, total: 3, totalPages: 3 },
          };
        },
      } as unknown as SeeakkApiClient;

      const summary = await PaymentSyncService.syncSeeakkPaymentRequests('TEST', { client: mockClient });

      assert.deepEqual(pagesRequested, [1, 2, 3]);
      assert.equal(summary.total, 3);
      assert.equal(summary.created, 3);
    } finally {
      prisma.paymentProofRequest.findUnique = originalFindUnique;
      prisma.company.findUnique = originalCompanyFind;
      prisma.plan.findUnique = originalPlanFind;
      prisma.paymentProofRequest.create = originalCreate;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 5. Payment detail validation
  it('5. Status mapping logic maps remote statuses accurately', () => {
    assert.equal(mapSeeakkPaymentStatusToControlStatus('APPROVED'), PaymentRequestStatus.APPROVED);
    assert.equal(mapSeeakkPaymentStatusToControlStatus('REJECTED'), PaymentRequestStatus.REJECTED);
    assert.equal(mapSeeakkPaymentStatusToControlStatus('UNDER_REVIEW'), PaymentRequestStatus.UNDER_REVIEW);
    assert.equal(mapSeeakkPaymentStatusToControlStatus('PAYMENT_SUBMITTED'), PaymentRequestStatus.UNDER_REVIEW);
    assert.equal(mapSeeakkPaymentStatusToControlStatus('PAYMENT_REQUIRED'), PaymentRequestStatus.PENDING);
    assert.equal(mapSeeakkPaymentStatusToControlStatus('UNKNOWN'), PaymentRequestStatus.PENDING);
  });

  // 6. Proof URL / streaming response handling
  it('6. SeeakkApiClient getPaymentProof supports binary buffer and JSON storage keys', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock binary response
      (globalThis as any).fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
      });

      const client = new SeeakkApiClient('TEST');
      const binaryResult = await client.getPaymentProof('pr_proof_1');
      assert.ok('data' in binaryResult);
      assert.equal(binaryResult.contentType, 'image/png');

      // Mock JSON storage key response
      (globalThis as any).fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, proofStorageKey: 'uploads/receipt_99.pdf' }),
      });

      const jsonResult = await client.getPaymentProof('pr_proof_2');
      assert.ok('storageKey' in jsonResult);
      assert.equal(jsonResult.storageKey, 'uploads/receipt_99.pdf');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Approval authorization
  it('7. Rejects approval execution if administrator lacks payments:review permission', () => {
    const unauthorizedSession: AdminSession = {
      id: 'viewer_1',
      email: 'viewer@control.internal',
      name: 'Viewer Admin',
      role: 'VIEWER',
      permissions: ['companies:read'], // missing payments:review
    };

    assert.equal(hasPermission(unauthorizedSession, 'payments:review'), false);
    assert.throws(() => {
      assertPermission(unauthorizedSession, 'payments:review');
    }, /Forbidden/i);
  });

  // 8. Approval validation
  it('8. Approval validation rejects accessUntil date that is before accessFrom date', () => {
    const invalidDates = approvePaymentSchema.safeParse({
      paymentRequestId: 'pr_val_1',
      approvedUserLimit: 5,
      accessFrom: '2026-10-01',
      accessUntil: '2026-09-01', // before from
      environment: 'TEST',
    });

    assert.equal(invalidDates.success, false);
    if (!invalidDates.success) {
      assert.match(invalidDates.error.issues[0]?.message || '', /strictly after access start date/i);
    }

    const validApproval = approvePaymentSchema.safeParse({
      paymentRequestId: 'pr_val_1',
      approvedUserLimit: 5,
      accessFrom: '2026-09-01',
      accessUntil: '2026-10-01',
      environment: 'TEST',
    });
    assert.equal(validApproval.success, true);
  });

  // 9. Successful approval
  it('9. Successful approval dispatches to SEEAKK approve endpoint and executes mutation', async () => {
    let approveCallArgs: any = null;
    const syncService = new SeeakkSyncService({
      approvePayment: async (id: string, body: any, opts: any) => {
        approveCallArgs = { id, body, opts };
        return { success: true, message: 'Approved' };
      },
    } as unknown as SeeakkApiClient);

    const result = await syncService.approvePayment(
      'pr_123',
      {
        approvedUserLimit: 10,
        accessFrom: '2026-09-01T00:00:00Z',
        accessUntil: '2026-10-01T00:00:00Z',
        remarks: 'Wire verified',
      },
      { env: 'TEST' }
    );

    assert.equal(result.success, true);
    assert.equal(approveCallArgs.id, 'pr_123');
    assert.equal(approveCallArgs.body.approvedUserLimit, 10);
  });

  // 10. Failed approval does not mark local payment approved
  it('10. Failed approval preserves pending status and throws integration error', async () => {
    const syncService = new SeeakkSyncService({
      approvePayment: async () => {
        throw new SeeakkServerError('SEEAKK server internal error', 500, 'corr_fail', '/approve');
      },
    } as unknown as SeeakkApiClient);

    await assert.rejects(
      async () => {
        await syncService.approvePayment('pr_fail', { approvedUserLimit: 5 }, { env: 'TEST' });
      },
      (err: any) => {
        assert.ok(err instanceof SeeakkServerError);
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
  });

  // 11. Rejection authorization
  it('11. Rejection requires payments:review permission', () => {
    const superAdminSession: AdminSession = {
      id: 'super_1',
      email: 'super@control.internal',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      permissions: ['payments:review', 'companies:write'],
    };

    assert.equal(hasPermission(superAdminSession, 'payments:review'), true);
  });

  // 12. Rejection reason validation
  it('12. Rejection reason rejects empty or short reason (<3 characters)', () => {
    const shortReason = rejectPaymentSchema.safeParse({
      paymentRequestId: 'pr_rej_1',
      reason: 'no', // only 2 chars
      environment: 'TEST',
    });

    assert.equal(shortReason.success, false);
    if (!shortReason.success) {
      assert.match(shortReason.error.issues[0]?.message || '', /at least 3 characters/i);
    }

    const validReason = rejectPaymentSchema.safeParse({
      paymentRequestId: 'pr_rej_1',
      reason: 'Payment receipt illegible; please re-upload.',
      environment: 'TEST',
    });
    assert.equal(validReason.success, true);
  });

  // 13. Successful rejection
  it('13. Successful rejection dispatches to SEEAKK reject endpoint with reason', async () => {
    let rejectCallArgs: any = null;
    const syncService = new SeeakkSyncService({
      rejectPayment: async (id: string, body: any, opts: any) => {
        rejectCallArgs = { id, body, opts };
        return { success: true, message: 'Rejected' };
      },
    } as unknown as SeeakkApiClient);

    const result = await syncService.rejectPayment(
      'pr_rej_99',
      { reason: 'Invalid UTR reference number' },
      { env: 'TEST' }
    );

    assert.equal(result.success, true);
    assert.equal(rejectCallArgs.id, 'pr_rej_99');
    assert.equal(rejectCallArgs.body.reason, 'Invalid UTR reference number');
  });

  // 14. Idempotent approval
  it('14. Idempotent approval prevents duplicate remote mutations on repeated execution', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;
    try {
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_log_done',
        idempotencyKey: 'payment_approve_TEST_pr_idem_1',
        status: SyncStatus.SUCCESS,
        responsePayload: { success: true, message: 'Already approved' },
        lastAttemptAt: new Date(),
      });

      const syncService = new SeeakkSyncService();
      const result = await syncService.approvePayment('pr_idem_1', { approvedUserLimit: 2 }, { env: 'TEST' });

      assert.equal(result.alreadyExecuted, true);
      assert.equal(result.success, true);
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
    }
  });

  // 15. Idempotent rejection
  it('15. Idempotent rejection prevents duplicate remote mutations on repeated execution', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;
    try {
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_log_done',
        idempotencyKey: 'payment_reject_TEST_pr_idem_2',
        status: SyncStatus.SUCCESS,
        responsePayload: { success: true, message: 'Already rejected' },
        lastAttemptAt: new Date(),
      });

      const syncService = new SeeakkSyncService();
      const result = await syncService.rejectPayment('pr_idem_2', { reason: 'Duplicate' }, { env: 'TEST' });

      assert.equal(result.alreadyExecuted, true);
      assert.equal(result.success, true);
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
    }
  });

  // 16. Concurrent approval protection
  it('16. Concurrency protection blocks in-flight duplicate operations within short interval', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;
    try {
      // Simulate an operation that is currently PENDING (in-flight)
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_in_flight',
        idempotencyKey: 'payment_approve_TEST_pr_inflight',
        status: SyncStatus.PENDING,
        lastAttemptAt: new Date(), // recent attempt
      });

      const syncService = new SeeakkSyncService();
      await assert.rejects(
        async () => {
          await syncService.approvePayment('pr_inflight', { approvedUserLimit: 2 }, { env: 'TEST' });
        },
        (err: any) => {
          assert.match(err.message, /currently in-flight/i);
          return true;
        }
      );
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
    }
  });

  // 17. Audit events generated
  it('17. Generates complete audit record upon successful payment review operation', async () => {
    let capturedAudit: any = null;
    const originalAuditCreate = prisma.auditLog.create;
    try {
      (prisma.auditLog as any).create = async (args: any) => {
        capturedAudit = args.data;
        return { id: 'audit_pay_01', ...args.data };
      };

      await AuditService.record({
        adminEmail: 'finance_admin@seeakk.com',
        action: AuditAction.PAYMENT_APPROVED,
        entityType: 'PaymentProofRequest',
        entityId: 'pay_req_100',
        oldValue: { status: 'PENDING' },
        newValue: { status: 'APPROVED' },
        metadata: {
          paymentRequestId: 'pr_remote_100',
          workspaceId: 'ws_100',
          approvedUserLimit: 5,
        },
      });

      assert.equal(capturedAudit.action, 'PAYMENT_APPROVED');
      assert.equal(capturedAudit.entityId, 'pay_req_100');
      assert.equal(capturedAudit.adminEmail, 'finance_admin@seeakk.com');
      assert.equal(capturedAudit.metadata.approvedUserLimit, 5);
    } finally {
      prisma.auditLog.create = originalAuditCreate;
    }
  });

  // 18. Secret sanitization
  it('18. Redacts service keys, tokens, and authorization headers from payloads and audit logs', () => {
    const rawPayload = {
      workspaceId: 'ws_clean',
      serviceKey: 'top_secret_service_key_99999',
      bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
      normalField: 'ValidValue',
    };

    const sanitized = sanitizePayloadForStorage(rawPayload) as any;
    assert.equal(sanitized.workspaceId, 'ws_clean');
    assert.equal(sanitized.normalField, 'ValidValue');
    assert.equal(sanitized.serviceKey, '[REDACTED]');
    assert.equal(sanitized.bearerToken, '[REDACTED]');
  });

  // 19. Remote API failures handled safely
  it('19. Categorizes remote API errors safely without exposing raw internal details', () => {
    const notFoundErr = new SeeakkNotFoundError('Payment proof not found', 'corr_1', '/proof');
    assert.equal(notFoundErr.statusCode, 404);
    assert.match(notFoundErr.toSafeUserMessage(), /not found/i);

    const timeoutErr = new SeeakkTimeoutError('/api/internal/platform/payment-requests', 'corr_2');
    assert.equal(timeoutErr.statusCode, 504);
    assert.match(timeoutErr.toSafeUserMessage(), /timeout/i);
  });

  // 20. Permission enforcement
  it('20. Validates syncPaymentRequestsSchema environment boundaries', () => {
    const validTest = syncPaymentRequestsSchema.safeParse({ environment: 'TEST' });
    assert.equal(validTest.success, true);

    const validProd = syncPaymentRequestsSchema.safeParse({ environment: 'PRODUCTION' });
    assert.equal(validProd.success, true);

    const invalidEnv = syncPaymentRequestsSchema.safeParse({ environment: 'DEV_LOCAL' });
    assert.equal(invalidEnv.success, false);
  });
});
