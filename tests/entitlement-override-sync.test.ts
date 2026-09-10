import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db/prisma';
import { SyncStatus } from '@prisma/client';
import { SeeakkSyncService } from '../src/server/services/seeakk-sync.service';
import { SeeakkApiClient } from '../src/lib/seeakk-client/client';
import { EntitlementService } from '../src/server/services/entitlement.service';

describe('User Seat Entitlement & Override Synchronization', () => {
  it('1. EntitlementService resolves company-specific override over plan default', () => {
    const planEntitlements = [
      { key: 'USERS' as const, type: 'NUMERIC' as const, numericValue: 5, booleanValue: null },
    ];
    const overrides = [
      {
        key: 'USERS' as const,
        type: 'NUMERIC' as const,
        numericValue: 6,
        booleanValue: null,
        reason: 'VIP contract override',
        updatedAt: new Date(),
      },
    ];
    const usages = [
      { metricKey: 'USERS' as const, currentValue: 4 },
    ];

    const effective = EntitlementService.computeEffectiveEntitlements(
      planEntitlements,
      overrides,
      usages
    );

    const userEntitlement = effective.find((e) => e.key === 'USERS');
    assert.ok(userEntitlement);
    assert.equal(userEntitlement.planDefault, 5);
    assert.equal(userEntitlement.override, 6);
    assert.equal(userEntitlement.effectiveValue, 6);
    assert.equal(userEntitlement.isOverridden, true);
    assert.equal(userEntitlement.usage?.current, 4);
    assert.equal(userEntitlement.usage?.limit, 6);
    assert.equal(userEntitlement.usage?.remaining, 2);
  });

  it('2. EntitlementService reverts to plan default when override is removed', () => {
    const planEntitlements = [
      { key: 'USERS' as const, type: 'NUMERIC' as const, numericValue: 5, booleanValue: null },
    ];
    const usages = [
      { metricKey: 'USERS' as const, currentValue: 4 },
    ];

    const effective = EntitlementService.computeEffectiveEntitlements(
      planEntitlements,
      [],
      usages
    );

    const userEntitlement = effective.find((e) => e.key === 'USERS');
    assert.ok(userEntitlement);
    assert.equal(userEntitlement.planDefault, 5);
    assert.equal(userEntitlement.override, null);
    assert.equal(userEntitlement.effectiveValue, 5);
    assert.equal(userEntitlement.isOverridden, false);
    assert.equal(userEntitlement.usage?.current, 4);
    assert.equal(userEntitlement.usage?.limit, 5);
    assert.equal(userEntitlement.usage?.remaining, 1);
  });

  it('3. SeeakkSyncService.updateCompanyLimit executes outbound mutation with idempotency and records in SystemSyncLog', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;
    const originalCreate = prisma.systemSyncLog.create;
    const originalUpdate = prisma.systemSyncLog.update;

    let executedCall = false;
    const mockClient = {
      updateCompanyLimit: async (wsId: string, body: any) => {
        executedCall = true;
        assert.equal(wsId, 'ws_test_seat');
        assert.equal(body.approvedUserLimit, 6);
        return { success: true, message: 'Limit updated' };
      },
    } as unknown as SeeakkApiClient;

    try {
      (prisma.systemSyncLog as any).findUnique = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({
        id: 'sync_seat_001',
        ...args.data,
      });
      (prisma.systemSyncLog as any).update = async (args: any) => ({
        id: 'sync_seat_001',
        ...args.data,
      });

      const syncService = new SeeakkSyncService(mockClient);
      const result = await syncService.updateCompanyLimit(
        'comp_test_1',
        { approvedUserLimit: 6, reason: 'Override to 6' },
        { workspaceId: 'ws_test_seat', env: 'TEST' }
      );

      assert.equal(executedCall, true);
      assert.equal(result.success, true);
      assert.equal(result.data.success, true);
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
      prisma.systemSyncLog.create = originalCreate;
      prisma.systemSyncLog.update = originalUpdate;
    }
  });

  it('4. SeeakkSyncService.updateCompanyLimit handles already executed mutation idempotently', async () => {
    const originalFindUnique = prisma.systemSyncLog.findUnique;

    try {
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_seat_already_done',
        idempotencyKey: 'comp_limit_comp_100_op1',
        status: SyncStatus.SUCCESS,
        responsePayload: { success: true, message: 'Limit updated already' },
        lastAttemptAt: new Date(),
      });

      const syncService = new SeeakkSyncService();
      const result = await syncService.updateCompanyLimit(
        'comp_100',
        { approvedUserLimit: 6, reason: 'Test' },
        { workspaceId: 'ws_100', operationId: 'op1' }
      );

      assert.equal(result.alreadyExecuted, true);
      assert.equal(result.success, true);
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
    }
  });
});
