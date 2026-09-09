import { NextResponse } from 'next/server';
import { verifySeeakkWebhookSignature } from '@/lib/seeakk-client/signature';
import { assertServerOnly } from '@/lib/seeakk-client/config';

/**
 * Inbound webhook receiver for SEEAKK platform events.
 *
 * NOTE (PHASE 2 ARCHITECTURE REALITY):
 * Investigation of SEEAKK TEST backend confirmed that SEEAKK currently does NOT have an outbound
 * webhook dispatcher implemented to send platform events to Control Software.
 *
 * This foundation implements:
 * 1. Raw body extraction
 * 2. HMAC-SHA256 signature verification via timing-safe comparison
 * 3. Timestamp replay attack prevention (5-minute tolerance)
 * 4. Structured rejection of forged or expired requests
 *
 * Concrete business event dispatchers will be wired once SEEAKK backend dispatches platform webhooks.
 */
export async function POST(request: Request) {
  assertServerOnly();

  const secret = process.env.SEEAKK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook secret is not configured on the server.' },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('x-seeakk-signature') ||
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('signature');
  const timestampHeader = request.headers.get('x-seeakk-timestamp');

  const verification = verifySeeakkWebhookSignature({
    rawBody,
    signatureHeader,
    secret,
    timestampHeader,
  });

  if (!verification.isValid) {
    return NextResponse.json(
      { error: 'Invalid webhook signature or expired timestamp', reason: verification.reason },
      { status: 401 }
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Acknowledge valid signed webhook payload
  return NextResponse.json({
    received: true,
    eventType: payload.eventType || payload.type || 'unknown',
    processedAt: new Date().toISOString(),
    status: 'acknowledged_pending_event_bus',
  });
}
