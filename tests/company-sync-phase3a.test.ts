import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Environment, CompanyStatus, SyncStatus } from '@prisma/client';
import { prisma } from '../src/lib/db/prisma';
import {
  CompanySyncService,
  mapSeeakkStatusToControlStatus,
} from '../src/server/services/company-sync.service';
import { SeeakkApiClient } from '../src/lib/seeakk-client/client';
import { SeeakkSyncService, sanitizePayloadForStorage } from '../src/server/services/seeakk-sync.service';
import {
  lockCompanyAction,
  unlockCompanyAction,
  suspendCompanyAction,
  unsuspendCompanyAction,
  grantGracePeriodAction,
  revokeGracePeriodAction,
  syncCompaniesAction,
} from '../src/server/actions/company.actions';
import { AuditService } from '../src/server/services/audit.service';
import { assertPermission } from '../src/lib/auth/permissions';
import { AdminSession } from '../src/types/auth';
import { suspendCompanySchema } from '../src/lib/validation/schemas';

describe('Phase 3A: SEEAKK Company Synchronization & Status Operations', () => {
  const originalFetch = globalThis.fetch;
  const mockServiceKey = 'test_service_key_secret_99999';

  beforeEach(() => {
    process.env.SEEAKK_CONTROL_SERVICE_KEY = mockServiceKey;
    process.env.SEEAKK_API_BASE_URL_TEST = 'https://seeakk-test.internal';
    process.env.SEEAKK_ENVIRONMENT = 'TEST';
  });

  // 1. Company synchronization creates new companies
  it('1. Company synchronization creates new companies from SEEAKK response', async () => {
    const mockRemoteCompany = {
      id: 'ws_test_001',
      companyName: 'Acme Corporation',
      billingStatus: 'ACTIVE',
      activeUserCount: 5,
      activePlan: {
        id: 'plan_starter',
        code: 'STARTER',
        name: 'Starter Tier',
      },
    };

    let createdCompanyData: any = null;
    let createdUsageData: any = null;

    // Mock prisma
    const originalFindUnique = prisma.company.findUnique;
    const originalCreate = prisma.company.create;
    const originalUsageCreate = prisma.companyUsage.create;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_1', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_1', ...args.data });

      // Company does not exist initially
      (prisma.company as any).findUnique = async () => null;
      (prisma.company as any).create = async (args: any) => {
        createdCompanyData = args.data;
        return { id: 'ctrl_comp_001', ...args.data };
      };
      (prisma.companyUsage as any).create = async (args: any) => {
        createdUsageData = args.data;
        return { id: 'usage_001', ...args.data };
      };
      const originalPlanFindUnique = prisma.plan.findUnique;
      (prisma.plan as any).findUnique = async () => null;

      // Mock remote API client
      const mockClient = {
        getCompanies: async () => ({
          success: true,
          items: [mockRemoteCompany],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      const summary = await CompanySyncService.syncSeeakkCompanies('TEST', { client: mockClient });

      assert.equal(summary.created, 1);
      assert.equal(summary.total, 1);
      assert.equal(createdCompanyData.workspaceId, 'ws_test_001');
      assert.equal(createdCompanyData.name, 'Acme Corporation');
      assert.equal(createdCompanyData.environment, 'TEST');
      assert.equal(createdCompanyData.status, CompanyStatus.ACTIVE);
      assert.equal(createdUsageData.currentValue, 5);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.create = originalCreate;
      prisma.companyUsage.create = originalUsageCreate;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 2. Company synchronization updates existing companies
  it('2. Company synchronization updates existing companies without duplicate creation', async () => {
    const mockRemoteCompany = {
      id: 'ws_test_002',
      companyName: 'Beta Corp Renamed',
      billingStatus: 'PAST_DUE',
      activeUserCount: 12,
    };

    let updatedCompanyData: any = null;

    const originalFindUnique = prisma.company.findUnique;
    const originalUpdate = prisma.company.update;
    const originalUsageUpsert = prisma.companyUsage.upsert;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_2', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_2', ...args.data });

      // Existing company found
      (prisma.company as any).findUnique = async () => ({
        id: 'ctrl_comp_002',
        workspaceId: 'ws_test_002',
        environment: 'TEST',
        name: 'Beta Corp Old',
        status: CompanyStatus.ACTIVE,
        subscriptions: [{ id: 'sub_1', planId: 'plan_growth' }],
        usageRecords: [],
        gracePeriods: [],
      });

      (prisma.company as any).update = async (args: any) => {
        updatedCompanyData = args.data;
        return { id: 'ctrl_comp_002', ...args.data };
      };
      (prisma.companyUsage as any).upsert = async () => ({ id: 'usage_002' });

      const mockClient = {
        getCompanies: async () => ({
          success: true,
          items: [mockRemoteCompany],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      const summary = await CompanySyncService.syncSeeakkCompanies('TEST', { client: mockClient });

      assert.equal(summary.updated, 1);
      assert.equal(summary.created, 0);
      assert.equal(updatedCompanyData.name, 'Beta Corp Renamed');
      assert.equal(updatedCompanyData.status, CompanyStatus.PAST_DUE);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.update = originalUpdate;
      prisma.companyUsage.upsert = originalUsageUpsert;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 3. Company synchronization is idempotent
  it('3. Repeated synchronization of unchanged company reports unchanged', async () => {
    const mockRemoteCompany = {
      id: 'ws_test_003',
      companyName: 'Gamma Systems',
      billingStatus: 'ACTIVE',
      activeUserCount: 8,
    };

    const originalFindUnique = prisma.company.findUnique;
    const originalUpdate = prisma.company.update;
    const originalUsageUpsert = prisma.companyUsage.upsert;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_3', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_3', ...args.data });

      let updateCalled = false;
      (prisma.company as any).findUnique = async () => ({
        id: 'ctrl_comp_003',
        workspaceId: 'ws_test_003',
        environment: 'TEST',
        name: 'Gamma Systems',
        status: CompanyStatus.ACTIVE,
        subscriptions: [],
        usageRecords: [],
        gracePeriods: [],
      });
      (prisma.company as any).update = async () => {
        updateCalled = true;
      };
      (prisma.companyUsage as any).upsert = async () => ({ id: 'usage_003' });

      const mockClient = {
        getCompanies: async () => ({
          success: true,
          items: [mockRemoteCompany],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      const summary = await CompanySyncService.syncSeeakkCompanies('TEST', { client: mockClient });

      assert.equal(updateCalled, false, 'No company updates if fields are already identical');
      assert.equal(summary.created, 0);
      assert.equal(summary.updated, 1); // usage upsert was refreshed
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.update = originalUpdate;
      prisma.companyUsage.upsert = originalUsageUpsert;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 4. TEST and PRODUCTION companies remain isolated
  it('4. Preserves environment isolation across TEST and PRODUCTION for same workspaceId', async () => {
    let queriedEnvironment: string | null = null;

    const originalFindUnique = prisma.company.findUnique;
    const originalCreate = prisma.company.create;
    const originalUsageCreate = prisma.companyUsage.create;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_4', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_4', ...args.data });

      (prisma.company as any).findUnique = async (args: any) => {
        if (args.where?.workspaceId_environment) {
          queriedEnvironment = args.where.workspaceId_environment.environment;
        }
        return null;
      };
      (prisma.company as any).create = async (args: any) => ({ id: 'ctrl_004', ...args.data });
      (prisma.companyUsage as any).create = async () => ({ id: 'usage_004' });
      const originalPlanFind = prisma.plan.findUnique;
      (prisma.plan as any).findUnique = async () => null;

      const mockClient = {
        getCompanies: async () => ({
          success: true,
          items: [{ id: 'ws_common_id', companyName: 'Delta Test', billingStatus: 'TRIAL' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      await CompanySyncService.syncSeeakkCompanies('PRODUCTION', { client: mockClient });

      assert.equal(queriedEnvironment, 'PRODUCTION');
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.create = originalCreate;
      prisma.companyUsage.create = originalUsageCreate;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 5. Control-owned fields are preserved
  it('5. Synchronization never overwrites Control-owned commercial plans, overrides, or notes', async () => {
    let companyUpdatePayload: any = null;

    const originalFindUnique = prisma.company.findUnique;
    const originalUpdate = prisma.company.update;
    const originalUsageUpsert = prisma.companyUsage.upsert;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_5', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_5', ...args.data });

      (prisma.company as any).findUnique = async () => ({
        id: 'ctrl_comp_005',
        workspaceId: 'ws_005',
        environment: 'TEST',
        name: 'Old Name',
        status: CompanyStatus.ACTIVE,
        notes: 'Commercial VIP Customer — DO NOT CANCEL',
        billingAddress: '42 Silicon Avenue',
        subscriptions: [{ id: 'sub_enterprise', planId: 'plan_ent_custom' }],
        usageRecords: [],
        gracePeriods: [],
      });

      (prisma.company as any).update = async (args: any) => {
        companyUpdatePayload = args.data;
        return { id: 'ctrl_comp_005', ...args.data };
      };
      (prisma.companyUsage as any).upsert = async () => ({ id: 'usage_005' });

      const mockClient = {
        getCompanies: async () => ({
          success: true,
          items: [{ id: 'ws_005', companyName: 'New Platform Name', billingStatus: 'TRIAL' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      } as unknown as SeeakkApiClient;

      await CompanySyncService.syncSeeakkCompanies('TEST', { client: mockClient });

      assert.equal(companyUpdatePayload.name, 'New Platform Name');
      assert.equal(companyUpdatePayload.status, CompanyStatus.TRIAL);
      // Ensure notes, plan, and billing address were NOT included in update data
      assert.equal(companyUpdatePayload.notes, undefined);
      assert.equal(companyUpdatePayload.billingAddress, undefined);
      assert.equal(companyUpdatePayload.subscriptions, undefined);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.update = originalUpdate;
      prisma.companyUsage.upsert = originalUsageUpsert;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 6. Company pagination works
  it('6. Paginates across all pages returned by SEEAKK API', async () => {
    let pagesRequested: number[] = [];

    const originalFindUnique = prisma.company.findUnique;
    const originalCreate = prisma.company.create;
    const originalUsageCreate = prisma.companyUsage.create;
    const originalSyncLogCreate = prisma.systemSyncLog.create;
    const originalSyncLogUpdate = prisma.systemSyncLog.update;
    const originalSyncLogFindFirst = prisma.systemSyncLog.findFirst;

    try {
      (prisma.systemSyncLog as any).findFirst = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({ id: 'log_6', ...args.data });
      (prisma.systemSyncLog as any).update = async (args: any) => ({ id: 'log_6', ...args.data });

      (prisma.company as any).findUnique = async () => null;
      (prisma.company as any).create = async (args: any) => ({ id: args.data.workspaceId, ...args.data });
      (prisma.companyUsage as any).create = async () => ({ id: 'usage_p' });

      const mockClient = {
        getCompanies: async (params?: any) => {
          pagesRequested.push(params?.page || 1);
          return {
            success: true,
            items: [{ id: `ws_p_${params?.page}`, companyName: `Company Page ${params?.page}` }],
            pagination: { page: params?.page, limit: 50, total: 3, totalPages: 3 },
          };
        },
      } as unknown as SeeakkApiClient;

      const summary = await CompanySyncService.syncSeeakkCompanies('TEST', { client: mockClient });

      assert.deepEqual(pagesRequested, [1, 2, 3]);
      assert.equal(summary.total, 3);
      assert.equal(summary.created, 3);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.company.create = originalCreate;
      prisma.companyUsage.create = originalUsageCreate;
      prisma.systemSyncLog.create = originalSyncLogCreate;
      prisma.systemSyncLog.update = originalSyncLogUpdate;
      prisma.systemSyncLog.findFirst = originalSyncLogFindFirst;
    }
  });

  // 7. Status mapping logic
  it('7. Maps remote status flags (suspended, locked, grace, billingStatus) accurately', () => {
    // Suspended
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '1', companyName: 'A', suspended: true }),
      CompanyStatus.SUSPENDED
    );
    // Locked
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '2', companyName: 'B', locked: true }),
      CompanyStatus.SUSPENDED
    );
    // Grace
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '3', companyName: 'C', activeGrace: true }),
      CompanyStatus.GRACE_PERIOD
    );
    // Active
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '4', companyName: 'D', billingStatus: 'ACTIVE' }),
      CompanyStatus.ACTIVE
    );
    // Trial
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '5', companyName: 'E', billingStatus: 'TRIAL' }),
      CompanyStatus.TRIAL
    );
    // Expired / Past due
    assert.equal(
      mapSeeakkStatusToControlStatus({ id: '6', companyName: 'F', billingStatus: 'EXPIRED' }),
      CompanyStatus.PAST_DUE
    );
  });

  // 8. Suspend action requires valid reason
  it('8. Suspend action rejects empty or short reason (<3 chars)', async () => {
    const parsedInvalid = suspendCompanySchema.safeParse({
      companyId: 'comp_123',
      reason: 'no', // only 2 chars
    });
    assert.equal(parsedInvalid.success, false);
    if (!parsedInvalid.success) {
      assert.match(parsedInvalid.error.issues[0]?.message || '', /min 3 characters/i);
    }

    const parsedEmpty = suspendCompanySchema.safeParse({
      companyId: 'comp_123',
      reason: '',
    });
    assert.equal(parsedEmpty.success, false);

    const parsedValid = suspendCompanySchema.safeParse({
      companyId: 'comp_123',
      reason: 'Valid suspension reason',
    });
    assert.equal(parsedValid.success, true);
  });

  // 9. Unauthorized admin cannot execute controls
  it('9. Denies access if administrator lacks companies:status permission', async () => {
    const unauthorizedSession: AdminSession = {
      id: 'viewer_1',
      email: 'viewer@control.seeakk.internal',
      name: 'Viewer',
      role: 'VIEWER',
      permissions: ['companies:read'], // missing companies:status
    };

    assert.throws(
      () => {
        assertPermission(unauthorizedSession, 'companies:status');
      },
      (err: any) => {
        assert.match(err.message, /Forbidden/i);
        return true;
      }
    );
  });

  // 10. Audit logging records sanitized action
  it('10. AuditService records administrative operations with sanitized values', async () => {
    let capturedAudit: any = null;

    const originalAuditCreate = prisma.auditLog.create;
    try {
      (prisma.auditLog as any).create = async (args: any) => {
        capturedAudit = args.data;
        return { id: 'audit_log_001', ...args.data };
      };

      await AuditService.record({
        adminEmail: 'admin@seeakk.internal',
        action: 'COMPANY_STATUS_CHANGED' as any,
        entityType: 'Company',
        entityId: 'comp_audit_1',
        oldValue: { status: 'ACTIVE', serviceKey: 'secret_key_123' },
        newValue: { status: 'SUSPENDED', token: 'secret_token_456' },
        metadata: { reason: 'Policy violation' },
      });

      assert.equal(capturedAudit.action, 'COMPANY_STATUS_CHANGED');
      assert.equal(capturedAudit.entityId, 'comp_audit_1');
      assert.equal(capturedAudit.oldValue.status, 'ACTIVE');
      assert.equal(capturedAudit.oldValue.serviceKey, undefined); // sensitive key stripped
      assert.equal(capturedAudit.newValue.token, undefined); // token stripped
    } finally {
      prisma.auditLog.create = originalAuditCreate;
    }
  });

  // 11. Idempotent mutation execution prevents duplicate remote calls
  it('11. Prevents duplicate remote mutations on double submission with same idempotency key', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;
    try {
      // Simulate existing successful sync log
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_log_done',
        idempotencyKey: 'comp_lock_ws_100_op1',
        status: SyncStatus.SUCCESS,
        responsePayload: { success: true, message: 'Already locked' },
        lastAttemptAt: new Date(),
      });

      const syncService = new SeeakkSyncService();
      let callCount = 0;

      const result = await syncService.lockCompany(
        'ws_100',
        { reason: 'Duplicate test', lockedBy: 'admin' },
        { operationId: 'op1' }
      );

      assert.equal(result.alreadyExecuted, true);
      assert.equal(result.success, true);
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
    }
  });

  // 12. Secrets never leak into stored payloads
  it('12. Redacts secrets from stored sync log payloads', () => {
    const rawPayload = {
      workspaceId: 'ws_secret_test',
      authHeader: 'Bearer seeakk_jwt_top_secret_99999',
      apiKey: 'xyz_key_secret_8888',
      normalField: 'ValidCompany',
    };

    const sanitized = sanitizePayloadForStorage(rawPayload) as any;

    assert.equal(sanitized.workspaceId, 'ws_secret_test');
    assert.equal(sanitized.normalField, 'ValidCompany');
    assert.equal(sanitized.authHeader, '[REDACTED]');
    assert.equal(sanitized.apiKey, '[REDACTED]');
  });
});
