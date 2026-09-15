import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEnvironment,
  resolveSeeakkBaseUrl,
  resolveSeeakkServiceKey,
  getSeeakkClientConfig,
  assertServerOnly,
  SeeakkApiClient,
  SeeakkConfigError,
  redactSecrets,
} from '../src/lib/seeakk-client';

describe('Environment-Specific Service Key & API Routing Isolation', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  const mockTestKey = 'test_service_key_live_abc123';
  const mockProdKey = 'prod_service_key_live_xyz789';
  const mockTestBaseUrl = 'https://seeakk-test-api.internal';
  const mockProdBaseUrl = 'https://seeakk-prod-api.internal';

  beforeEach(() => {
    // Isolate clean environment variables for each test
    process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST = mockTestKey;
    process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION = mockProdKey;
    process.env.SEEAKK_API_BASE_URL_TEST = mockTestBaseUrl;
    process.env.SEEAKK_API_BASE_URL_PRODUCTION = mockProdBaseUrl;
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY;
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY_STAGING;
    delete process.env.SEEAKK_API_BASE_URL_STAGING;
    delete process.env.SEEAKK_API_BASE_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // 1. TEST company -> TEST API URL + TEST service key
  it('1. TEST company resolves strictly to TEST API URL and TEST service key', async () => {
    const config = getSeeakkClientConfig('TEST');
    assert.equal(config.baseUrl, mockTestBaseUrl);
    assert.equal(config.serviceKey, mockTestKey);

    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = '';
    globalThis.fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ success: true, modules: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('TEST');
    assert.equal(client.getBaseUrl(), mockTestBaseUrl);
    assert.equal(client.getEnvironment(), 'TEST');

    await client.getModules('corr_test_01');

    assert.ok(capturedUrl.startsWith(mockTestBaseUrl));
    assert.equal(capturedHeaders['x-service-key'], mockTestKey);
    assert.equal(capturedHeaders['Authorization'], `Bearer ${mockTestKey}`);
    assert.notEqual(capturedHeaders['x-service-key'], mockProdKey);
  });

  // 2. PRODUCTION company -> PRODUCTION API URL + PRODUCTION service key
  it('2. PRODUCTION company resolves strictly to PRODUCTION API URL and PRODUCTION service key', async () => {
    const config = getSeeakkClientConfig('PRODUCTION');
    assert.equal(config.baseUrl, mockProdBaseUrl);
    assert.equal(config.serviceKey, mockProdKey);

    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = '';
    globalThis.fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ success: true, modules: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeeakkApiClient('PRODUCTION');
    assert.equal(client.getBaseUrl(), mockProdBaseUrl);
    assert.equal(client.getEnvironment(), 'PRODUCTION');

    await client.getModules('corr_prod_01');

    assert.ok(capturedUrl.startsWith(mockProdBaseUrl));
    assert.equal(capturedHeaders['x-service-key'], mockProdKey);
    assert.equal(capturedHeaders['Authorization'], `Bearer ${mockProdKey}`);
    assert.notEqual(capturedHeaders['x-service-key'], mockTestKey);
  });

  // 3. Missing TEST key throws SeeakkConfigError and never falls back to PRODUCTION
  it('3. Missing TEST key throws SeeakkConfigError without falling back to PRODUCTION', () => {
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST;
    // Production key is still available in env
    assert.ok(process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION);

    assert.throws(
      () => resolveSeeakkServiceKey('TEST'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /SEEAKK_CONTROL_SERVICE_KEY_TEST is not configured/);
        return true;
      }
    );

    assert.throws(
      () => getSeeakkClientConfig('TEST'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /SEEAKK_CONTROL_SERVICE_KEY_TEST is not configured/);
        return true;
      }
    );

    assert.throws(
      () => new SeeakkApiClient('TEST'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        return true;
      }
    );
  });

  // 4. Missing PRODUCTION key throws SeeakkConfigError and never falls back to TEST
  it('4. Missing PRODUCTION key throws SeeakkConfigError without falling back to TEST', () => {
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION;
    // Test key is still available in env
    assert.ok(process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST);

    assert.throws(
      () => resolveSeeakkServiceKey('PRODUCTION'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION is not configured/);
        return true;
      }
    );

    assert.throws(
      () => getSeeakkClientConfig('PRODUCTION'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION is not configured/);
        return true;
      }
    );

    assert.throws(
      () => new SeeakkApiClient('PRODUCTION'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        return true;
      }
    );
  });

  // 5. Ensure the wrong environment key can never be selected
  it('5. Ensures wrong environment key can NEVER be selected under any circumstances', () => {
    const keyTest = resolveSeeakkServiceKey('TEST');
    const keyProd = resolveSeeakkServiceKey('PRODUCTION');

    assert.equal(keyTest, mockTestKey);
    assert.equal(keyProd, mockProdKey);
    assert.notEqual(keyTest, keyProd);

    // Verify lowercase inputs normalize safely
    assert.equal(resolveSeeakkServiceKey('test'), mockTestKey);
    assert.equal(resolveSeeakkServiceKey('production'), mockProdKey);

    // Verify baseUrl separation
    assert.equal(resolveSeeakkBaseUrl('test'), mockTestBaseUrl);
    assert.equal(resolveSeeakkBaseUrl('production'), mockProdBaseUrl);
    assert.notEqual(resolveSeeakkBaseUrl('test'), resolveSeeakkBaseUrl('production'));
  });

  // 6. Legacy shared SEEAKK_CONTROL_SERVICE_KEY is ignored and does not bypass separation
  it('6. Does NOT fall back to legacy shared SEEAKK_CONTROL_SERVICE_KEY', () => {
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION;
    delete process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST;
    process.env.SEEAKK_CONTROL_SERVICE_KEY = 'legacy_shared_key_do_not_use';

    assert.throws(
      () => resolveSeeakkServiceKey('PRODUCTION'),
      /SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION is not configured/
    );

    assert.throws(
      () => resolveSeeakkServiceKey('TEST'),
      /SEEAKK_CONTROL_SERVICE_KEY_TEST is not configured/
    );
  });

  // 7. Missing PRODUCTION API base URL does NOT fall back to TEST API URL
  it('7. Missing PRODUCTION API base URL throws SeeakkConfigError and never falls back to TEST URL', () => {
    delete process.env.SEEAKK_API_BASE_URL_PRODUCTION;
    // TEST URL is present
    assert.ok(process.env.SEEAKK_API_BASE_URL_TEST);

    assert.throws(
      () => resolveSeeakkBaseUrl('PRODUCTION'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /SEEAKK_API_BASE_URL_PRODUCTION for production target/);
        return true;
      }
    );
  });

  // 8. Rejects unknown target environment safely
  it('8. Rejects invalid target environment strings with clear error', () => {
    assert.throws(
      () => resolveEnvironment('DEV_LOCAL'),
      (err: any) => {
        assert.ok(err instanceof SeeakkConfigError);
        assert.match(err.message, /Invalid target environment 'DEV_LOCAL'/);
        return true;
      }
    );
  });

  // 9. Browser / Client-side execution guard (assertServerOnly)
  it('9. Enforces strict server-only execution and forbids browser execution', () => {
    // Assert server-only passes in Node
    assert.doesNotThrow(() => assertServerOnly());

    // Simulate browser window
    (globalThis as any).window = {};
    try {
      assert.throws(
        () => assertServerOnly(),
        /Security Violation: SeeakkApiClient can only be instantiated and executed server-side/
      );
      assert.throws(
        () => getSeeakkClientConfig('TEST'),
        /Security Violation/
      );
      assert.throws(
        () => new SeeakkApiClient('TEST'),
        /Security Violation/
      );
    } finally {
      delete (globalThis as any).window;
    }
  });

  // 10. Service keys are never exposed in user-facing error messages
  it('10. Service keys are never leaked in error messages or redacted representations', () => {
    const rawError = `Failed request with x-service-key: ${mockTestKey} and Bearer ${mockProdKey}`;
    const sanitized = redactSecrets(rawError);

    assert.ok(!sanitized.includes(mockTestKey));
    assert.ok(!sanitized.includes(mockProdKey));
    assert.ok(sanitized.includes('[REDACTED]'));

    // Config errors provide safe messages for users
    const configError = new SeeakkConfigError('Missing key');
    assert.equal(
      configError.toSafeUserMessage(),
      'SEEAKK integration service is not properly configured. Please verify server environment variables.'
    );
  });
});
