import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { checkSeeakkConnectivity } from '@/server/services/seeakk-health.service';

/**
 * Protected diagnostic endpoint for administrators to check SEEAKK server-to-server connectivity.
 * Requires active admin session and 'sync:manage' permission.
 * Never exposes credentials, service keys, or sensitive backend infrastructure details.
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized. Administrator authentication required.' },
      { status: 401 }
    );
  }

  if (!session.permissions.includes('sync:manage')) {
    return NextResponse.json(
      { error: 'Forbidden. "sync:manage" permission required for integration diagnostics.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetEnv = searchParams.get('env') || undefined;

  const healthResult = await checkSeeakkConnectivity(targetEnv);

  const httpStatus = healthResult.status === 'healthy' ? 200 : 503;
  return NextResponse.json(healthResult, { status: httpStatus });
}
