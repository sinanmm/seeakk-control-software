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

    // 4. Handle binary streaming vs. JSON reference
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

    return NextResponse.json({
      success: true,
      storageKey: proofResult.storageKey,
    });
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
