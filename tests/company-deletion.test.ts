import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db/prisma';
import { CompanyDeletionService } from '../src/server/services/company-deletion.service';
import { deleteCompanyAction } from '../src/server/actions/company.actions';
import { AdminSession } from '../src/types/auth';
import { assertPermission } from '../src/lib/auth/permissions';
import { SeeakkApiClient } from '../src/lib/seeakk-client/client';
import { AuditService } from '../src/server/services/audit.service';
import { redactSecrets } from '../src/lib/seeakk-client/errors';

describe('Company and Workspace Deletion System', () => {
  const superAdminSession: AdminSession = {
    id: 'admin_super_001',
    email: 'superadmin@seeakk.com',
    name: 'Super Administrator',
    role: 'SUPER_ADMIN',
    permissions: [
      'companies:read',
      'companies:write',
      'companies:delete',
      'companies:status',
      'audit:read',
    ],
  };

  const restrictedAdminSession: AdminSession = {
    id: 'admin_support_002',
    email: 'support@seeakk.com',
    name: 'Support Agent',
    role: 'SUPPORT',
    permissions: ['companies:read'],
  };

  beforeEach(() => {
    process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST = 'test_key_abc_123';
    process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION = 'prod_key_xyz_789';
    process.env.SEEAKK_API_BASE_URL_TEST = 'https://seeakk-test.internal';
    process.env.SEEAKK_API_BASE_URL_PRODUCTION = 'https://seeakk-prod.internal';
    process.env.SEEAKK_ENVIRONMENT = 'TEST';

    // Mock auditLog.create to avoid database connectivity requirement during unit tests
    (prisma.auditLog as any).create = async (args: any) => ({
      id: 'mock_audit_id',
      ...args.data,
    });
  });

  it('1. Rejects deletion if administrator lacks companies:delete permission', async () => {
    // Assert explicit permission check throws Forbidden
    assert.throws(
      () => {
        assertPermission(restrictedAdminSession, 'companies:delete');
      },
      (err: any) => {
        assert.match(err.message, /Forbidden/i);
        return true;
      }
    );

    // Assert service returns 403 Forbidden result
    const result = await CompanyDeletionService.deleteCompanyAndWorkspace(
      'comp_123',
      restrictedAdminSession
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 403);
    assert.match(result.message, /Forbidden/i);
  });

  it('2. Action validation rejects deletion when typed confirmation name does not match exact company name', async () => {
    const originalFindUnique = prisma.company.findUnique;
    prisma.company.findUnique = (async () => ({
      id: 'comp_123',
      name: 'Acme Corporation Inc',
      workspaceId: 'ws_123',
      environment: 'TEST',
    })) as any;

    try {
      const result = await deleteCompanyAction(
        'comp_123',
        'Acme Corp', // Mismatched confirmation name
        superAdminSession
      );

      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /Confirmation name does not match/i);
    } finally {
      prisma.company.findUnique = originalFindUnique;
    }
  });

  it('3. Throws 404 error if company does not exist', async () => {
    const originalFindUnique = prisma.company.findUnique;
    prisma.company.findUnique = (async () => null) as any;

    try {
      const result = await CompanyDeletionService.deleteCompanyAndWorkspace(
        'non_existent_company',
        superAdminSession
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.message, /not found/i);
    } finally {
      prisma.company.findUnique = originalFindUnique;
    }
  });

  it('4. Successfully deletes standalone company without workspaceId', async () => {
    const mockCompany = {
      id: 'comp_standalone_001',
      name: 'Standalone Enterprises',
      workspaceId: null,
      environment: 'TEST',
      billingStatus: 'ACTIVE',
    };

    const originalFindUnique = prisma.company.findUnique;
    const originalTransaction = prisma.$transaction;
    const originalAuditRecord = AuditService.record;

    let transactionExecuted = false;
    let auditLogged = false;

    prisma.company.findUnique = (async () => mockCompany) as any;
    prisma.$transaction = (async (callback: any) => {
      transactionExecuted = true;
      const txMock = {
        company: { delete: async () => mockCompany },
      };
      return await callback(txMock);
    }) as any;

    AuditService.record = (async (context: any) => {
      auditLogged = true;
      assert.strictEqual(context.entityId, 'comp_standalone_001');
      assert.strictEqual(context.newValue.deleted, true);
    }) as any;

    try {
      const result = await CompanyDeletionService.deleteCompanyAndWorkspace(
        'comp_standalone_001',
        superAdminSession
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(transactionExecuted, true);
      assert.strictEqual(auditLogged, true);
      assert.strictEqual(result.remoteWorkspaceDeleted, false);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.$transaction = originalTransaction;
      AuditService.record = originalAuditRecord;
    }
  });

  it('5. Successfully deletes company with SEEAKK workspace and cascades deletion', async () => {
    const mockCompany = {
      id: 'comp_full_001',
      name: 'Full Stack Corp',
      workspaceId: 'ws_full_001',
      environment: 'TEST',
      billingStatus: 'ACTIVE',
    };

    const originalFindUnique = prisma.company.findUnique;
    const originalTransaction = prisma.$transaction;
    const originalRemoteDelete = SeeakkApiClient.prototype.deleteCompany;
    const originalAuditRecord = AuditService.record;

    let remoteDeletionCalledWith: string | null = null;
    let transactionExecuted = false;
    let auditLogged = false;

    prisma.company.findUnique = (async () => mockCompany) as any;
    SeeakkApiClient.prototype.deleteCompany = (async function (
      this: any,
      workspaceId: string
    ) {
      remoteDeletionCalledWith = workspaceId;
      return {
        success: true,
        message: 'Company and workspace deleted successfully.',
      };
    }) as any;

    prisma.$transaction = (async (callback: any) => {
      transactionExecuted = true;
      const txMock = {
        company: { delete: async () => mockCompany },
      };
      return await callback(txMock);
    }) as any;

    AuditService.record = (async (context: any) => {
      auditLogged = true;
      assert.strictEqual(context.entityId, 'comp_full_001');
      assert.strictEqual(context.metadata.workspaceId, 'ws_full_001');
      assert.strictEqual(context.metadata.remoteWorkspaceDeleted, true);
    }) as any;

    try {
      const result = await CompanyDeletionService.deleteCompanyAndWorkspace(
        'comp_full_001',
        superAdminSession
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(remoteDeletionCalledWith, 'ws_full_001');
      assert.strictEqual(transactionExecuted, true);
      assert.strictEqual(auditLogged, true);
      assert.strictEqual(result.remoteWorkspaceDeleted, true);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.$transaction = originalTransaction;
      SeeakkApiClient.prototype.deleteCompany = originalRemoteDelete;
      AuditService.record = originalAuditRecord;
    }
  });

  it('6. Aborts local deletion if remote SEEAKK workspace deletion fails', async () => {
    const mockCompany = {
      id: 'comp_err_001',
      name: 'Error Corp',
      workspaceId: 'ws_err_001',
      environment: 'TEST',
      billingStatus: 'ACTIVE',
    };

    const originalFindUnique = prisma.company.findUnique;
    const originalTransaction = prisma.$transaction;
    const originalRemoteDelete = SeeakkApiClient.prototype.deleteCompany;

    let transactionExecuted = false;

    prisma.company.findUnique = (async () => mockCompany) as any;
    SeeakkApiClient.prototype.deleteCompany = (async function () {
      throw new Error('Remote SEEAKK server timeout or storage error');
    }) as any;

    prisma.$transaction = (async () => {
      transactionExecuted = true;
    }) as any;

    try {
      const result = await CompanyDeletionService.deleteCompanyAndWorkspace(
        'comp_err_001',
        superAdminSession
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.statusCode, 502);
      assert.match(result.message, /Remote SEEAKK server timeout/i);

      // Verify transaction was never run because remote deletion failed
      assert.strictEqual(transactionExecuted, false);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.$transaction = originalTransaction;
      SeeakkApiClient.prototype.deleteCompany = originalRemoteDelete;
    }
  });

  it('7. Concurrency protection blocks duplicate in-flight deletion requests', async () => {
    const mockCompany = {
      id: 'comp_concurr_001',
      name: 'Concurrent Corp',
      workspaceId: 'ws_concurr_001',
      environment: 'TEST',
      billingStatus: 'ACTIVE',
    };

    const originalFindUnique = prisma.company.findUnique;
    const originalRemoteDelete = SeeakkApiClient.prototype.deleteCompany;
    const originalTransaction = prisma.$transaction;

    prisma.company.findUnique = (async () => mockCompany) as any;
    // Simulate long-running remote deletion
    SeeakkApiClient.prototype.deleteCompany = (async () => {
      await new Promise((res) => setTimeout(res, 30));
      return { success: true, message: 'Done' };
    }) as any;

    prisma.$transaction = (async (cb: any) => {
      const txMock = {
        company: { delete: async () => mockCompany },
      };
      return await cb(txMock);
    }) as any;

    try {
      const promise1 = CompanyDeletionService.deleteCompanyAndWorkspace(
        'comp_concurr_001',
        superAdminSession
      );

      // Attempt second deletion while first is in-flight
      const res2 = await CompanyDeletionService.deleteCompanyAndWorkspace(
        'comp_concurr_001',
        superAdminSession
      );

      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.statusCode, 409);
      assert.match(res2.message, /already in progress/i);

      const res1 = await promise1;
      assert.strictEqual(res1.success, true);
    } finally {
      prisma.company.findUnique = originalFindUnique;
      prisma.$transaction = originalTransaction;
      SeeakkApiClient.prototype.deleteCompany = originalRemoteDelete;
    }
  });

  it('8. Redacts service keys and sensitive secrets from error messages', () => {
    const rawError = 'Request failed with serviceKey: test_key_abc_123 and Bearer eyJhbGciOiJIUzI1Ni...';
    const redacted = redactSecrets(rawError);
    assert.doesNotMatch(redacted, /test_key_abc_123/);
    assert.doesNotMatch(redacted, /eyJhbGciOiJIUzI1Ni/);
    assert.match(redacted, /\[REDACTED\]/);
  });
});
