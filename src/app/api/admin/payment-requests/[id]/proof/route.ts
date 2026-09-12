import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { SeeakkNotFoundError, SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
        console.error('Failed to fetch proof image from presigned URL:', fetchErr);
      }
    }

    if ('storageKey' in proofResult && proofResult.storageKey) {
      try {
        const wasabiClient = new S3Client({
          endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
          region: process.env.WASABI_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.WASABI_ACCESS_KEY || '2I71AT7OHBH9LF4KDG28',
            secretAccessKey: process.env.WASABI_SECRET_KEY || 'MQM2UAH2GTYTJP30Qtz9DatKNzrhGdKkFzud8jtQ',
          },
          forcePathStyle: true,
        });
        const cleanKey = proofResult.storageKey.startsWith('/')
          ? proofResult.storageKey.slice(1)
          : proofResult.storageKey;
        const bucket = process.env.WASABI_BUCKET || 'geniusgroup';
        const s3Res = await wasabiClient.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: cleanKey,
          })
        );
        if (s3Res.Body) {
          const stream = s3Res.Body as any;
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const buffer = Buffer.concat(chunks);
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': s3Res.ContentType || 'image/png',
              'Cache-Control': 'private, no-store, must-revalidate',
              'Content-Disposition': 'inline',
            },
          });
        }
      } catch (s3Err) {
        console.error('Failed to retrieve proof directly from Wasabi storage:', s3Err);
      }
    }

    return NextResponse.json({
      success: true,
      storageKey: proofResult.storageKey,
      proofUrl: (proofResult as any).proofUrl,
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
