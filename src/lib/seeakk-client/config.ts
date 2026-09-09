import { Environment } from '@prisma/client';
import { SeeakkConfigError } from './errors';

export interface SeeakkClientConfig {
  baseUrl: string;
  serviceKey: string;
  webhookSecret?: string;
  timeoutMs: number;
}

/**
 * Validates that code is executing in a server-side Node.js environment.
 * Throws immediately if invoked in client/browser bundles.
 */
export function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Security Violation: SeeakkApiClient can only be instantiated and executed server-side. ' +
        'Client browser execution is strictly forbidden.'
    );
  }
}

/**
 * Resolves the appropriate SEEAKK API base URL based on the specified environment.
 */
export function resolveSeeakkBaseUrl(env?: Environment | string): string {
  assertServerOnly();

  const targetEnv = (
    env ||
    process.env.SEEAKK_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).toUpperCase();

  if (targetEnv === 'PRODUCTION') {
    const prodUrl =
      process.env.SEEAKK_API_BASE_URL_PRODUCTION ||
      process.env.SEEAKK_API_BASE_URL;
    if (prodUrl) {
      return prodUrl.replace(/\/+$/, '');
    }
    // If test URL is configured in non-production deployments or tests, fallback gracefully
    const testFallback = process.env.SEEAKK_API_BASE_URL_TEST;
    if (testFallback) {
      return testFallback.replace(/\/+$/, '');
    }
    throw new SeeakkConfigError(
      'Missing required environment variable SEEAKK_API_BASE_URL_PRODUCTION for production target.'
    );
  }

  if (targetEnv === 'STAGING') {
    const stagingUrl =
      process.env.SEEAKK_API_BASE_URL_STAGING ||
      process.env.SEEAKK_API_BASE_URL;
    if (stagingUrl) {
      return stagingUrl.replace(/\/+$/, '');
    }
    const testFallback = process.env.SEEAKK_API_BASE_URL_TEST;
    if (testFallback) {
      return testFallback.replace(/\/+$/, '');
    }
    throw new SeeakkConfigError(
      'Missing required environment variable SEEAKK_API_BASE_URL_STAGING for staging target.'
    );
  }

  // Default to TEST / Local development URL
  const testUrl =
    process.env.SEEAKK_API_BASE_URL_TEST ||
    process.env.SEEAKK_API_BASE_URL ||
    'http://localhost:5000';

  return testUrl.replace(/\/+$/, '');
}

/**
 * Loads and validates the SEEAKK client credentials.
 * Service key is never logged or exposed.
 */
export function getSeeakkClientConfig(env?: Environment | string): SeeakkClientConfig {
  assertServerOnly();

  const baseUrl = resolveSeeakkBaseUrl(env);
  const serviceKey = (process.env.SEEAKK_CONTROL_SERVICE_KEY || '').trim();

  if (!serviceKey) {
    throw new SeeakkConfigError(
      'Server configuration error: SEEAKK_CONTROL_SERVICE_KEY is not configured in the environment. ' +
        'Cannot authenticate server-to-server platform requests.'
    );
  }

  return {
    baseUrl,
    serviceKey,
    webhookSecret: process.env.SEEAKK_WEBHOOK_SECRET,
    timeoutMs: 10000, // Strict 10-second timeout
  };
}
