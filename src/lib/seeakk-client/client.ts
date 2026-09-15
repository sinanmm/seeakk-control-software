import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Environment } from '@prisma/client';
import {
  assertServerOnly,
  getSeeakkClientConfig,
  SeeakkClientConfig,
} from './config';
import {
  SeeakkIntegrationError,
  SeeakkAuthError,
  SeeakkForbiddenError,
  SeeakkNotFoundError,
  SeeakkValidationError,
  SeeakkClientError,
  SeeakkServerError,
  SeeakkTimeoutError,
  SeeakkNetworkError,
  redactSecrets,
} from './errors';
import {
  SeeakkDashboardResponse,
  SeeakkDashboardResponseSchema,
  SeeakkModulesResponse,
  SeeakkModulesResponseSchema,
  SeeakkCompanyListResponse,
  SeeakkCompanyListResponseSchema,
  SeeakkCompanyDetailsResponse,
  SeeakkCompanyDetailsResponseSchema,
  SeeakkCompanyEntitlementResponse,
  SeeakkCompanyEntitlementResponseSchema,
  SeeakkCompanyUsersResponse,
  SeeakkCompanyUsersResponseSchema,
  SeeakkActionResponse,
  SeeakkActionResponseSchema,
  SeeakkPaymentRequestListResponse,
  SeeakkPaymentRequestListResponseSchema,
  SeeakkPaymentRequestDetailsResponse,
  SeeakkPaymentRequestDetailsResponseSchema,
  SeeakkRevenueResponse,
  SeeakkRevenueResponseSchema,
  LockCompanyInput,
  UnlockCompanyInput,
  SuspendCompanyInput,
  UnsuspendCompanyInput,
  GrantGraceInput,
  RevokeGraceInput,
  ApprovePaymentInput,
  RejectPaymentInput,
  UpdateCompanyLimitInput,
} from './contracts';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  queryParams?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  correlationId?: string;
  idempotencyKey?: string;
  /** Max retries for safe transient failures (default: 2 for GET or idempotent requests, 0 for unsafe mutations) */
  maxRetries?: number;
  /** Override timeout in ms (default 10000) */
  timeoutMs?: number;
}

/**
 * Server-only HTTP client for communicating with SEEAKK platform internal APIs.
 * Enforces zero client-side leakage, strict 10s timeout, transient failure retry,
 * correlation tracking, and Zod response validation.
 */
export class SeeakkApiClient {
  private readonly config: SeeakkClientConfig;
  private readonly environment?: Environment | string;

  constructor(env?: Environment | string, configOverride?: Partial<SeeakkClientConfig>) {
    assertServerOnly();
    this.environment = env;
    const baseConfig = getSeeakkClientConfig(env);
    this.config = {
      ...baseConfig,
      ...configOverride,
    };
  }

  /**
   * Returns the environment targeted by this client instance.
   */
  public getEnvironment(): Environment | string | undefined {
    return this.environment;
  }

  /**
   * Returns the resolved base URL targeted by this client instance.
   */
  public getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Internal HTTP execution engine with timeout, backoff, and error mapping.
   */
  public async executeRequest<T>(
    options: RequestOptions,
    responseSchema: z.ZodType<T, any, any>
  ): Promise<T> {
    assertServerOnly();

    const {
      method = 'GET',
      path,
      queryParams,
      body,
      correlationId = `ctrl_${randomUUID()}`,
      idempotencyKey,
      timeoutMs = this.config.timeoutMs,
    } = options;

    // Check retry policy: unsafe mutations CANNOT be retried unless caller passed an idempotency key!
    const isSafeMethod = method === 'GET';
    const isIdempotent = isSafeMethod || Boolean(idempotencyKey);
    const defaultRetries = isIdempotent ? 2 : 0;
    const maxRetries = options.maxRetries ?? defaultRetries;

    // Build URL with query params
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.config.baseUrl}${normalizedPath}`);

    if (queryParams) {
      for (const [key, val] of Object.entries(queryParams)) {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      }
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'x-service-key': this.config.serviceKey,
      'Authorization': `Bearer ${this.config.serviceKey}`,
      'x-correlation-id': correlationId,
    };

    if (idempotencyKey) {
      headers['x-idempotency-key'] = idempotencyKey;
    }

    let requestBodyString: string | undefined;
    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      requestBodyString = JSON.stringify(body);
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      const abortController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: requestBodyString,
          signal: abortController.signal,
        });

        clearTimeout(timeoutTimer);

        // Process HTTP Status codes
        if (!response.ok) {
          let errorData: any;
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: await response.text().catch(() => 'No response body') };
          }

          const errorMessage =
            errorData?.message ||
            errorData?.error ||
            `SEEAKK request failed with status ${response.status}`;

          // Map to specific integration error
          if (response.status === 401) {
            throw new SeeakkAuthError(errorMessage, correlationId, normalizedPath);
          }
          if (response.status === 403) {
            throw new SeeakkForbiddenError(errorMessage, correlationId, normalizedPath);
          }
          if (response.status === 404) {
            throw new SeeakkNotFoundError(errorMessage, correlationId, normalizedPath);
          }
          if (response.status === 422 || response.status === 400) {
            throw new SeeakkValidationError(
              errorMessage,
              errorData?.errors || errorData,
              correlationId,
              normalizedPath
            );
          }

          // Check if status is a transient 5xx server error (502, 503, 504)
          const isTransientServerError = [502, 503, 504].includes(response.status);
          if (isTransientServerError && isIdempotent && attempt < maxRetries) {
            attempt++;
            const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw new SeeakkServerError(errorMessage, response.status, correlationId, normalizedPath);
        }

        // Parse and validate response JSON with Zod schema
        let responseJson: unknown;
        try {
          responseJson = await response.json();
        } catch (jsonErr) {
          throw new SeeakkValidationError(
            'Failed to parse JSON response from SEEAKK platform.',
            undefined,
            correlationId,
            normalizedPath
          );
        }

        const parseResult = responseSchema.safeParse(responseJson);
        if (!parseResult.success) {
          const formattedZodError = parseResult.error.format();
          throw new SeeakkValidationError(
            `SEEAKK response violated API contract schema for endpoint ${normalizedPath}: ${parseResult.error.message}`,
            formattedZodError as Record<string, unknown>,
            correlationId,
            normalizedPath
          );
        }

        return parseResult.data as T;
      } catch (err: any) {
        clearTimeout(timeoutTimer);

        // Handle AbortController timeout
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          const timeoutErr = new SeeakkTimeoutError(normalizedPath, correlationId);
          if (isIdempotent && attempt < maxRetries) {
            attempt++;
            const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          throw timeoutErr;
        }

        // If it's already a categorized SeeakkIntegrationError, rethrow (unless transient 5xx already handled)
        if (err instanceof SeeakkIntegrationError) {
          throw err;
        }

        // Handle network failures (e.g. ECONNREFUSED, ENOTFOUND)
        const networkErr = new SeeakkNetworkError(
          `Failed to connect to SEEAKK API: ${redactSecrets(err.message)}`,
          err,
          correlationId,
          normalizedPath
        );

        if (isIdempotent && attempt < maxRetries) {
          attempt++;
          const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw networkErr;
      }
    }

    throw (
      lastError ||
      new SeeakkServerError('Unknown failure during SEEAKK request execution.', 500, correlationId, normalizedPath)
    );
  }

  // ---------------------------------------------------------------------------
  // 1. DASHBOARD & SYSTEM METRICS
  // ---------------------------------------------------------------------------

  public async getDashboard(correlationId?: string): Promise<SeeakkDashboardResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: '/api/internal/platform/dashboard',
        correlationId,
      },
      SeeakkDashboardResponseSchema
    );
  }

  public async getModules(correlationId?: string): Promise<SeeakkModulesResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: '/api/internal/platform/modules',
        correlationId,
      },
      SeeakkModulesResponseSchema
    );
  }

  // ---------------------------------------------------------------------------
  // 2. COMPANIES / WORKSPACES
  // ---------------------------------------------------------------------------

  public async getCompanies(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    plan?: string;
    correlationId?: string;
  }): Promise<SeeakkCompanyListResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: '/api/internal/platform/companies',
        queryParams: {
          page: params?.page,
          limit: params?.limit,
          search: params?.search,
          status: params?.status,
          plan: params?.plan,
        },
        correlationId: params?.correlationId,
      },
      SeeakkCompanyListResponseSchema
    );
  }

  public async getCompanyDetails(
    companyId: string,
    correlationId?: string
  ): Promise<SeeakkCompanyDetailsResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}`,
        correlationId,
      },
      SeeakkCompanyDetailsResponseSchema
    );
  }

  public async getCompanyEntitlement(
    companyId: string,
    correlationId?: string
  ): Promise<SeeakkCompanyEntitlementResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/entitlement`,
        correlationId,
      },
      SeeakkCompanyEntitlementResponseSchema
    );
  }

  public async getCompanyUsers(
    companyId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      role?: string;
      correlationId?: string;
    }
  ): Promise<SeeakkCompanyUsersResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/users`,
        queryParams: {
          page: params?.page,
          limit: params?.limit,
          search: params?.search,
          role: params?.role,
        },
        correlationId: params?.correlationId,
      },
      SeeakkCompanyUsersResponseSchema
    );
  }

  // ---------------------------------------------------------------------------
  // 3. COMPANY LIFECYCLE & ACCESS MUTATIONS
  // ---------------------------------------------------------------------------

  public async lockCompany(
    companyId: string,
    body: LockCompanyInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/lock`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async unlockCompany(
    companyId: string,
    body: UnlockCompanyInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/unlock`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async suspendCompany(
    companyId: string,
    body: SuspendCompanyInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/suspend`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async unsuspendCompany(
    companyId: string,
    body: UnsuspendCompanyInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/unsuspend`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async grantGrace(
    companyId: string,
    body: GrantGraceInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/grace`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async revokeGrace(
    companyId: string,
    body: RevokeGraceInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/revoke-grace`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async updateCompanyLimit(
    companyId: string,
    body: UpdateCompanyLimitInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/companies/${encodeURIComponent(companyId)}/limit`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  // ---------------------------------------------------------------------------
  // 4. PAYMENT REQUEST OPERATIONS
  // ---------------------------------------------------------------------------

  public async getPaymentRequests(params?: {
    page?: number;
    limit?: number;
    status?: string;
    companyId?: string;
    correlationId?: string;
  }): Promise<SeeakkPaymentRequestListResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: '/api/internal/platform/payment-requests',
        queryParams: {
          page: params?.page,
          limit: params?.limit,
          status: params?.status,
          companyId: params?.companyId,
        },
        correlationId: params?.correlationId,
      },
      SeeakkPaymentRequestListResponseSchema
    );
  }

  public async getPaymentRequestDetails(
    paymentRequestId: string,
    correlationId?: string
  ): Promise<SeeakkPaymentRequestDetailsResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: `/api/internal/platform/payment-requests/${encodeURIComponent(paymentRequestId)}`,
        correlationId,
      },
      SeeakkPaymentRequestDetailsResponseSchema
    );
  }

  /**
   * Fetches the binary proof document or storage key from SEEAKK platform.
   */
  public async getPaymentProof(
    paymentRequestId: string,
    correlationId?: string
  ): Promise<{ data: ArrayBuffer; contentType: string } | { storageKey: string; proofUrl?: string }> {
    assertServerOnly();
    const path = `/api/internal/platform/payment-requests/${encodeURIComponent(paymentRequestId)}/proof`;
    const url = `${this.config.baseUrl}${path}`;
    const corrId = correlationId || `ctrl_${randomUUID()}`;

    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => abortController.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-service-key': this.config.serviceKey,
          'Authorization': `Bearer ${this.config.serviceKey}`,
          'x-correlation-id': corrId,
        },
        signal: abortController.signal,
      });

      clearTimeout(timeoutTimer);

      if (!response.ok) {
        if (response.status === 404) {
          throw new SeeakkNotFoundError('Payment proof not found', corrId, path);
        }
        throw new SeeakkServerError(
          `Failed to retrieve payment proof: HTTP ${response.status}`,
          response.status,
          corrId,
          path
        );
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        return {
          storageKey: json.proofStorageKey || json.storageKey || '',
          proofUrl: json.proofUrl,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      return { data: arrayBuffer, contentType };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (err instanceof SeeakkIntegrationError) throw err;
      if (err.name === 'AbortError') {
        throw new SeeakkTimeoutError(path, corrId);
      }
      throw new SeeakkNetworkError(redactSecrets(err.message), err, corrId, path);
    }
  }

  public async approvePayment(
    paymentRequestId: string,
    body: ApprovePaymentInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/payment-requests/${encodeURIComponent(paymentRequestId)}/approve`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  public async rejectPayment(
    paymentRequestId: string,
    body: RejectPaymentInput,
    options?: { correlationId?: string; idempotencyKey?: string }
  ): Promise<SeeakkActionResponse> {
    return this.executeRequest(
      {
        method: 'POST',
        path: `/api/internal/platform/payment-requests/${encodeURIComponent(paymentRequestId)}/reject`,
        body,
        correlationId: options?.correlationId,
        idempotencyKey: options?.idempotencyKey,
      },
      SeeakkActionResponseSchema
    );
  }

  // ---------------------------------------------------------------------------
  // 5. REVENUE METRICS
  // ---------------------------------------------------------------------------

  public async getRevenue(params?: {
    from?: string;
    to?: string;
    correlationId?: string;
  }): Promise<SeeakkRevenueResponse> {
    return this.executeRequest(
      {
        method: 'GET',
        path: '/api/internal/platform/revenue',
        queryParams: {
          from: params?.from,
          to: params?.to,
        },
        correlationId: params?.correlationId,
      },
      SeeakkRevenueResponseSchema
    );
  }
}
