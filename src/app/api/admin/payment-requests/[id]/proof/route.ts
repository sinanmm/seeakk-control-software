import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { SeeakkNotFoundError, SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate admin user
    const session = await getCurrentSession();
    if (!session || !hasPermission(session, 'payments:review')) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized: payments:review permission required.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id } = params;
    if (!id) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Missing payment request identifier.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Locate local payment record to resolve environment & remote ID
    const localRecord = await prisma.paymentProofRequest.findFirst({
      where: {
        OR: [{ id }, { seeakkPaymentId: id }],
      },
      select: {
        seeakkPaymentId: true,
        environment: true,
      },
    });

    const environment = localRecord?.environment || 'TEST';
    const seeakkId = localRecord?.seeakkPaymentId || id;

    // 3. Request proof from SEEAKK platform via server-to-server HTTPS
    const client = new SeeakkApiClient(environment);
    const proofResult = await client.getPaymentProof(seeakkId);

    // 4. Handle binary streaming directly from platform
    if ('data' in proofResult) {
      return new Response(proofResult.data, {
        status: 200,
        headers: {
          'Content-Type': proofResult.contentType || 'image/jpeg',
          'Cache-Control': 'private, no-store, must-revalidate',
          'Content-Disposition': 'inline',
        },
      });
    }

    // 5. Handle presigned proofUrl from platform
    if ('proofUrl' in proofResult && proofResult.proofUrl) {
      try {
        const remoteRes = await fetch(proofResult.proofUrl);
        if (remoteRes.ok) {
          const imgBuffer = await remoteRes.arrayBuffer();
          const contentType = remoteRes.headers.get('content-type') || 'image/png';
          return new Response(imgBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'private, no-store, must-revalidate',
              'Content-Disposition': 'inline',
            },
          });
        }
      } catch (fetchErr) {
        console.error('[GET /api/admin/payment-requests/:id/proof] Failed to fetch proof from proofUrl:', fetchErr);
      }
    }

    // 6. Handle offline verified payments without an attached screenshot
    if ('storageKey' in proofResult && proofResult.storageKey === 'OFFLINE_VERIFIED') {
      const svgBadge = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260" viewBox="0 0 600 260">
  <rect width="600" height="260" fill="#09090b" rx="12" stroke="#27272a" stroke-width="1.5"/>
  <circle cx="300" cy="80" r="32" fill="#10b981" fill-opacity="0.12" stroke="#10b981" stroke-width="2"/>
  <path d="M288 80 L296 88 L312 72" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="300" y="145" fill="#f4f4f5" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" text-anchor="middle">Offline Verified Payment</text>
  <text x="300" y="175" fill="#a1a1aa" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">This payment was approved directly in Control Software without an attached document.</text>
  <text x="300" y="215" fill="#71717a" font-family="monospace" font-size="11" text-anchor="middle">Request ID: ${seeakkId}</text>
</svg>`.trim();

      return new Response(svgBadge, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'private, no-store, must-revalidate',
          'Content-Disposition': 'inline',
        },
      });
    }

    // 7. If no binary or valid URL was retrievable
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Payment proof screenshot not found on SEEAKK.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof SeeakkNotFoundError) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Payment proof screenshot not found on SEEAKK.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.error('[GET /api/admin/payment-requests/:id/proof] Error:', err);
    const statusCode = err instanceof SeeakkIntegrationError ? err.statusCode : 500;
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: redactSecrets(err.message || 'Failed to retrieve payment proof'),
      }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
