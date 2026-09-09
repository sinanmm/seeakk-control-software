import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { assertServerOnly } from '@/lib/seeakk-client/config';
import { redactSecrets } from '@/lib/seeakk-client/errors';

export interface SeeakkHealthCheckResult {
  status: 'healthy' | 'unhealthy';
  checkedAt: string;
  latencyMs: number;
  targetEnvironment?: string;
  error?: string;
}

/**
 * Checks authenticated server-to-server connectivity from Control Software to the SEEAKK platform.
 * Executes a lightweight authenticated internal API call (GET /api/internal/platform/modules).
 * Guaranteed to never leak service keys, authorization headers, or database strings.
 */
export async function checkSeeakkConnectivity(
  env?: string,
  client?: SeeakkApiClient
): Promise<SeeakkHealthCheckResult> {
  assertServerOnly();

  const startTime = Date.now();
  const seeakkClient = client || new SeeakkApiClient(env);

  try {
    const modulesResponse = await seeakkClient.getModules();
    const latencyMs = Date.now() - startTime;

    if (modulesResponse.success) {
      return {
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        latencyMs,
        targetEnvironment: env || process.env.NODE_ENV || 'development',
      };
    }

    return {
      status: 'unhealthy',
      checkedAt: new Date().toISOString(),
      latencyMs,
      targetEnvironment: env || process.env.NODE_ENV || 'development',
      error: 'SEEAKK platform responded with non-success status.',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      status: 'unhealthy',
      checkedAt: new Date().toISOString(),
      latencyMs,
      targetEnvironment: env || process.env.NODE_ENV || 'development',
      error: redactSecrets(err?.message || 'Failed to establish connection to SEEAKK platform.'),
    };
  }
}
