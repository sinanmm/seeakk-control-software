import crypto from 'crypto';
import { assertServerOnly } from './config';

export interface VerifyWebhookSignatureOptions {
  /** Raw request body as string or Buffer */
  rawBody: string | Buffer;
  /** Signature header received (e.g. from x-seeakk-signature or x-hub-signature-256) */
  signatureHeader: string | null | undefined;
  /** Secret key shared between SEEAKK and Control Software */
  secret: string;
  /** Optional timestamp header for replay protection (e.g. from x-seeakk-timestamp) */
  timestampHeader?: string | null | undefined;
  /** Maximum allowable age of the webhook event in seconds. Default is 300 (5 minutes). */
  toleranceSeconds?: number;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates an incoming webhook signature using HMAC-SHA256 and timingSafeEqual.
 * Implements strict server-side execution, raw body hashing, and timestamp replay protection.
 */
export function verifySeeakkWebhookSignature(
  options: VerifyWebhookSignatureOptions
): WebhookVerificationResult {
  assertServerOnly();

  const {
    rawBody,
    signatureHeader,
    secret,
    timestampHeader,
    toleranceSeconds = 300,
  } = options;

  if (!secret) {
    return { isValid: false, reason: 'Missing webhook secret for verification.' };
  }

  if (!signatureHeader) {
    return { isValid: false, reason: 'Missing signature header in request.' };
  }

  // If timestamp is provided, enforce replay protection
  if (timestampHeader) {
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      return { isValid: false, reason: 'Invalid timestamp header format.' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Timestamp cannot be older than toleranceSeconds or more than 60s in the future (clock skew)
    if (nowSeconds - timestamp > toleranceSeconds) {
      return { isValid: false, reason: 'Webhook timestamp has expired (possible replay attack).' };
    }
    if (timestamp - nowSeconds > 60) {
      return { isValid: false, reason: 'Webhook timestamp is too far in the future.' };
    }
  }

  try {
    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;

    // Normalize incoming signature string (strip prefix like "sha256=" if present)
    const cleanSignature = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    const hmac = crypto.createHmac('sha256', secret);
    // If timestamp was validated, include timestamp in HMAC payload if standard signature format
    if (timestampHeader) {
      hmac.update(`${timestampHeader}.`);
    }
    hmac.update(bodyBuffer);
    const expectedSignature = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const actualBuffer = Buffer.from(cleanSignature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      // If timestamp was included in HMAC above but signature was generated without it,
      // fallback to body-only verification for backwards compatibility
      const fallbackHmac = crypto.createHmac('sha256', secret);
      fallbackHmac.update(bodyBuffer);
      const fallbackExpected = fallbackHmac.digest('hex');
      const fallbackBuffer = Buffer.from(fallbackExpected, 'hex');

      if (fallbackBuffer.length === actualBuffer.length && crypto.timingSafeEqual(fallbackBuffer, actualBuffer)) {
        return { isValid: true };
      }

      return { isValid: false, reason: 'Signature mismatch (invalid hash length or content).' };
    }

    const matches = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!matches) {
      // Also test fallback body-only HMAC if timestamp variation was attempted
      const fallbackHmac = crypto.createHmac('sha256', secret);
      fallbackHmac.update(bodyBuffer);
      const fallbackExpected = fallbackHmac.digest('hex');
      const fallbackBuffer = Buffer.from(fallbackExpected, 'hex');

      if (fallbackBuffer.length === actualBuffer.length && crypto.timingSafeEqual(fallbackBuffer, actualBuffer)) {
        return { isValid: true };
      }

      return { isValid: false, reason: 'Signature comparison failed.' };
    }

    return { isValid: true };
  } catch (err) {
    return {
      isValid: false,
      reason: `Signature verification error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
