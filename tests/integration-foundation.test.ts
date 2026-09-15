import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { z } from 'zod';
import {
  SeeakkApiClient,
  redactSecrets,
  SeeakkAuthError,
  SeeakkForbiddenError,
  SeeakkNotFoundError,
  SeeakkValidationError,
  SeeakkServerError,
  SeeakkTimeoutError,
  verifySeeakkWebhookSignature,
} from '../src/lib/seeakk-client';
import { sanitizePayloadForStorage } from '../src/server/services/seeakk-sync.service';

describe('SEEAKK Server-to-Server Integration Foundation', () => {
  const originalFetch = globalThis.fetch;
  const mockServiceKey = 'test_service_key_secret_12345';
  const mockBaseUrl = 'https://seeakk-test.internal';

  beforeEach(() => {
    process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST = mockServiceKey;
    process.env.SEEAKK_API_BASE_URL_TEST = mockBaseUrl;
    process.env.SEEAKK_WEBHOOK_SECRET = 'test_webhook_secret_67890';
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY;
  });

  // 1. API Client Authentication Headers
  it('1. Sends x-service-key, Bearer token, and x-correlation-id headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (_url: any, init: any) => {
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ success: true, modules: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('TEST');
    await client.getModules('test_correlation_42');

    assert.equal(capturedHeaders['x-service-key'], mockServiceKey);
    assert.equal(capturedHeaders['Authorization'], `Bearer ${mockServiceKey}`);
    assert.equal(capturedHeaders['x-correlation-id'], 'test_correlation_42');

    globalThis.fetch = originalFetch;
  });

  // 2. Timeout Behaviour
  it('2. Handles timeout and raises SeeakkTimeoutError', async () => {
    globalThis.fetch = async (_url: any, init: any) => {
      // Simulate delayed response that triggers AbortSignal
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    };

    const client = new SeeakkApiClient('TEST', { timeoutMs: 50 });

    await assert.rejects(
      async () => {
        // maxRetries: 0 to check immediate timeout handling
        await client.executeRequest(
          { path: '/api/internal/platform/modules', maxRetries: 0 },
          z.any()
        );
      },
      (err: any) => {
        assert.ok(err instanceof SeeakkTimeoutError);
        assert.equal(err.statusCode, 504);
        return true;
      }
    );

    globalThis.fetch = originalFetch;
  });

  // 3. Retry Behaviour for Safe / Idempotent Requests
  it('3. Retries transient 502/503/504 errors for GET requests', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts < 3) {
        return new Response(JSON.stringify({ message: 'Bad Gateway' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, modules: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('TEST');
    const result = await client.getModules();

    assert.equal(attempts, 3);
    assert.equal(result.success, true);

    globalThis.fetch = originalFetch;
  });

  // 4. No Retry for Unsafe Mutation Without Idempotency Protection
  it('4. Does NOT retry unsafe mutation requests when no idempotencyKey is supplied', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return new Response(JSON.stringify({ message: 'Service Unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('TEST');

    await assert.rejects(
      async () => {
        // executeRequest with POST and no idempotencyKey
        await client.executeRequest(
          {
            method: 'POST',
            path: '/api/internal/platform/companies/test_id/lock',
            body: { reason: 'Test' },
          },
          z.any()
        );
      },
      (err: any) => {
        assert.ok(err instanceof SeeakkServerError);
        assert.equal(err.statusCode, 503);
        return true;
      }
    );

    assert.equal(attempts, 1, 'Unsafe mutation must only execute once');

    globalThis.fetch = originalFetch;
  });

  // 5. Zod Response Validation
  it('5. Validates response schemas with Zod and rejects malformed payloads', async () => {
    globalThis.fetch = async () => {
      // Missing required "success" field
      return new Response(JSON.stringify({ invalidField: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('TEST');

    await assert.rejects(
      async () => {
        await client.getModules();
      },
      (err: any) => {
        assert.ok(err instanceof SeeakkValidationError);
        assert.equal(err.statusCode, 422);
        return true;
      }
    );

    globalThis.fetch = originalFetch;
  });

  // 6. 4xx Handling
  it('6. Categorizes 401, 403, 404, and 422 errors into specific error classes', async () => {
    const client = new SeeakkApiClient('TEST');

    // 401
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Invalid service key' }), { status: 401 });
    await assert.rejects(
      async () => client.getModules(),
      (err: any) => err instanceof SeeakkAuthError && err.statusCode === 401
    );

    // 403
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'IP not allowlisted' }), { status: 403 });
    await assert.rejects(
      async () => client.getModules(),
      (err: any) => err instanceof SeeakkForbiddenError && err.statusCode === 403
    );

    // 404
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Company not found' }), { status: 404 });
    await assert.rejects(
      async () => client.getCompanyDetails('non_existent'),
      (err: any) => err instanceof SeeakkNotFoundError && err.statusCode === 404
    );

    // 422
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Validation failed', errors: { reason: 'Required' } }), {
        status: 422,
      });
    await assert.rejects(
      async () =>
        client.lockCompany('comp_1', { reason: '', lockedBy: 'admin' }, { idempotencyKey: 'k1' }),
      (err: any) => err instanceof SeeakkValidationError && err.statusCode === 422
    );

    globalThis.fetch = originalFetch;
  });

  // 7. 5xx Handling
  it('7. Handles 500 Internal Server Error without infinite loop', async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return new Response(JSON.stringify({ message: 'Fatal database exception' }), {
        status: 500,
      });
    };

    const client = new SeeakkApiClient('TEST');

    await assert.rejects(
      async () => client.getModules(),
      (err: any) => err instanceof SeeakkServerError && err.statusCode === 500
    );

    // 500 is not transient 502/503/504, so it should not retry
    assert.equal(attempts, 1);

    globalThis.fetch = originalFetch;
  });

  // 8. Webhook Signature Verification
  it('8. Verifies valid HMAC-SHA256 signature and detects tampering / expired timestamps', () => {
    const secret = 'webhook_secret_key_prod_test';
    const payload = JSON.stringify({ event: 'company.updated', companyId: 'comp_123' });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Valid HMAC calculation with timestamp
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.`);
    hmac.update(payload);
    const validSignature = hmac.digest('hex');

    // Positive case
    const validResult = verifySeeakkWebhookSignature({
      rawBody: payload,
      signatureHeader: validSignature,
      secret,
      timestampHeader: timestamp,
    });
    assert.equal(validResult.isValid, true);

    // Tampered payload
    const tamperedResult = verifySeeakkWebhookSignature({
      rawBody: payload + 'tampered',
      signatureHeader: validSignature,
      secret,
      timestampHeader: timestamp,
    });
    assert.equal(tamperedResult.isValid, false);

    // Expired timestamp (older than 300s)
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const expiredResult = verifySeeakkWebhookSignature({
      rawBody: payload,
      signatureHeader: validSignature,
      secret,
      timestampHeader: expiredTimestamp,
    });
    assert.equal(expiredResult.isValid, false);
    assert.match(expiredResult.reason || '', /expired/i);
  });

  // 9. Secret Redaction
  it('9. Redacts secrets, service keys, and tokens from error strings and stored payloads', () => {
    const rawError =
      'Request to https://seeakk-test.internal failed: x-service-key: super_secret_val_12345 with Bearer token_secret_abc';
    const cleaned = redactSecrets(rawError);

    assert.ok(!cleaned.includes('super_secret_val_12345'));
    assert.ok(!cleaned.includes('token_secret_abc'));
    assert.ok(cleaned.includes('[REDACTED]'));

    // Payload storage sanitization
    const sensitivePayload = {
      action: 'approve',
      serviceKey: 'top_secret_key',
      companyId: 'comp_123',
      nested: {
        adminToken: 'admin_bearer_xyz',
        publicNote: 'Approved for Q3',
      },
    };

    const sanitized = sanitizePayloadForStorage(sensitivePayload) as any;
    assert.equal(sanitized.serviceKey, '[REDACTED]');
    assert.equal(sanitized.nested.adminToken, '[REDACTED]');
    assert.equal(sanitized.companyId, 'comp_123');
    assert.equal(sanitized.nested.publicNote, 'Approved for Q3');
  });

  // 10. Idempotency Behaviour via SeeakkSyncService
  it('10. Enforces deterministic idempotency, blocks concurrent in-flight execution, and avoids duplicate execution', async () => {
    const { prisma } = await import('../src/lib/db/prisma');
    const { SeeakkSyncService } = await import('../src/server/services/seeakk-sync.service');

    const originalFindUnique = prisma.systemSyncLog.findUnique;
    const originalCreate = prisma.systemSyncLog.create;
    const originalUpdate = prisma.systemSyncLog.update;

    try {
      const syncService = new SeeakkSyncService();
      let actionCallCount = 0;

      // Case A: First execution (no existing log)
      (prisma.systemSyncLog as any).findUnique = async () => null;
      (prisma.systemSyncLog as any).create = async (args: any) => ({
        id: 'sync_log_001',
        ...args.data,
      });
      (prisma.systemSyncLog as any).update = async (args: any) => ({
        id: 'sync_log_001',
        ...args.data,
      });

      const firstResult = await syncService.executeOutboundMutation({
        idempotencyKey: 'test_idemp_key_1',
        eventType: 'payment.approved',
        requestPayload: { approvedUserLimit: 10 },
        action: async () => {
          actionCallCount++;
          return { success: true, message: 'Approved' };
        },
      });

      assert.equal(actionCallCount, 1);
      assert.equal(firstResult.alreadyExecuted, false);
      assert.equal(firstResult.data.success, true);

      // Case B: Duplicate execution (already succeeded)
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_log_001',
        idempotencyKey: 'test_idemp_key_1',
        status: 'SUCCESS',
        responsePayload: { success: true, message: 'Cached approval result' },
        lastAttemptAt: new Date(),
      });

      const duplicateResult = await syncService.executeOutboundMutation({
        idempotencyKey: 'test_idemp_key_1',
        eventType: 'payment.approved',
        requestPayload: { approvedUserLimit: 10 },
        action: async () => {
          actionCallCount++;
          return { success: true, message: 'Should not run' };
        },
      });

      assert.equal(actionCallCount, 1, 'Action must NOT be called for duplicate execution');
      assert.equal(duplicateResult.alreadyExecuted, true);
      assert.equal((duplicateResult.data as any).message, 'Cached approval result');

      // Case C: Concurrent in-flight execution (< 15s ago, PENDING)
      (prisma.systemSyncLog as any).findUnique = async () => ({
        id: 'sync_log_002',
        idempotencyKey: 'test_idemp_key_2',
        status: 'PENDING',
        lastAttemptAt: new Date(), // Just now
      });

      await assert.rejects(
        async () => {
          await syncService.executeOutboundMutation({
            idempotencyKey: 'test_idemp_key_2',
            eventType: 'company.locked',
            requestPayload: { reason: 'Test' },
            action: async () => ({ success: true }),
          });
        },
        (err: any) => {
          assert.ok(err instanceof SeeakkValidationError);
          assert.match(err.message, /currently in-flight/i);
          return true;
        }
      );
    } finally {
      prisma.systemSyncLog.findUnique = originalFindUnique;
      prisma.systemSyncLog.create = originalCreate;
      prisma.systemSyncLog.update = originalUpdate;
    }
  });

  // 11. Health & Connectivity Check Service
  it('11. Health check service reports healthy on success and unhealthy on failure', async () => {
    const { checkSeeakkConnectivity } = await import('../src/server/services/seeakk-health.service');

    // Positive case
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: true, modules: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const healthyResult = await checkSeeakkConnectivity('TEST');
    assert.equal(healthyResult.status, 'healthy');
    assert.ok(healthyResult.latencyMs >= 0);

    // Failure case (unreachable or 500)
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 });

    const unhealthyResult = await checkSeeakkConnectivity('TEST');
    assert.equal(unhealthyResult.status, 'unhealthy');
    assert.ok(unhealthyResult.error);

    globalThis.fetch = originalFetch;
  });
});
