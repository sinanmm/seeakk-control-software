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

export type ResolvedEnvironment = 'TEST' | 'PRODUCTION' | 'STAGING';

/**
 * Resolves and normalizes the target company environment.
 * Preserves existing TEST, STAGING, and PRODUCTION environment classification.
 */
export function resolveEnvironment(env?: Environment | string): ResolvedEnvironment {
  if (env) {
    const normalized = String(env).trim().toUpperCase();
    if (normalized === 'PRODUCTION') return 'PRODUCTION';
    if (normalized === 'STAGING') return 'STAGING';
    if (normalized === 'TEST') return 'TEST';
    throw new SeeakkConfigError(
      `Invalid target environment '${env}'. Expected TEST, STAGING, or PRODUCTION.`
    );
  }

  if (process.env.SEEAKK_ENVIRONMENT) {
    const configured = process.env.SEEAKK_ENVIRONMENT.trim().toUpperCase();
    if (configured === 'PRODUCTION') return 'PRODUCTION';
    if (configured === 'STAGING') return 'STAGING';
    if (configured === 'TEST') return 'TEST';
  }

  // Safe default to TEST when no environment is explicitly provided
  return 'TEST';
}

/**
 * Dynamically resolves the environment-specific control service key.
 * Strictly separates TEST and PRODUCTION keys with zero fallback between environments.
 * Service keys are never logged or exposed.
 */
export function resolveSeeakkServiceKey(env?: Environment | string): string {
  assertServerOnly();

  const targetEnv = resolveEnvironment(env);

  if (targetEnv === 'PRODUCTION') {
    const serviceKey = (process.env.SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION || '').trim();
    if (!serviceKey) {
      throw new SeeakkConfigError(
        'Server configuration error: SEEAKK_CONTROL_SERVICE_KEY_PRODUCTION is not configured in the environment. ' +
          'Cannot authenticate production platform requests.'
      );
    }
    return serviceKey;
  }

  if (targetEnv === 'STAGING') {
    const serviceKey = (process.env.SEEAKK_CONTROL_SERVICE_KEY_STAGING || '').trim();
    if (!serviceKey) {
      throw new SeeakkConfigError(
        'Server configuration error: SEEAKK_CONTROL_SERVICE_KEY_STAGING is not configured in the environment. ' +
          'Cannot authenticate staging platform requests.'
      );
    }
    return serviceKey;
  }

  // TEST environment
  const serviceKey = (process.env.SEEAKK_CONTROL_SERVICE_KEY_TEST || '').trim();
  if (!serviceKey) {
    throw new SeeakkConfigError(
      'Server configuration error: SEEAKK_CONTROL_SERVICE_KEY_TEST is not configured in the environment. ' +
        'Cannot authenticate test platform requests.'
    );
  }
  return serviceKey;
}

/**
 * Resolves the appropriate SEEAKK API base URL based on the specified environment.
 * Strictly separates TEST and PRODUCTION endpoints with zero fallback between environments.
 */
export function resolveSeeakkBaseUrl(env?: Environment | string): string {
  assertServerOnly();

  const targetEnv = resolveEnvironment(env);

  if (targetEnv === 'PRODUCTION') {
    const prodUrl = (
      process.env.SEEAKK_API_BASE_URL_PRODUCTION ||
      process.env.SEEAKK_API_BASE_URL ||
      ''
    ).trim();

    if (prodUrl) {
      return prodUrl.replace(/\/+$/, '');
    }
    throw new SeeakkConfigError(
      'Missing required environment variable SEEAKK_API_BASE_URL_PRODUCTION for production target.'
    );
  }

  if (targetEnv === 'STAGING') {
    const stagingUrl = (
      process.env.SEEAKK_API_BASE_URL_STAGING ||
      process.env.SEEAKK_API_BASE_URL ||
      ''
    ).trim();

    if (stagingUrl) {
      return stagingUrl.replace(/\/+$/, '');
    }
    throw new SeeakkConfigError(
      'Missing required environment variable SEEAKK_API_BASE_URL_STAGING for staging target.'
    );
  }

  // Default to TEST / Local development URL
  const testUrl = (
    process.env.SEEAKK_API_BASE_URL_TEST ||
    process.env.SEEAKK_API_BASE_URL ||
    'http://localhost:5000'
  ).trim();

  return testUrl.replace(/\/+$/, '');
}

/**
 * Loads and validates the SEEAKK client credentials dynamically for the target environment.
 * Service keys are never logged or exposed.
 */
export function getSeeakkClientConfig(env?: Environment | string): SeeakkClientConfig {
  assertServerOnly();

  const baseUrl = resolveSeeakkBaseUrl(env);
  const serviceKey = resolveSeeakkServiceKey(env);

  return {
    baseUrl,
    serviceKey,
    webhookSecret: process.env.SEEAKK_WEBHOOK_SECRET,
    timeoutMs: 10000, // Strict 10-second timeout
  };
}
