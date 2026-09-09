/**
 * Sanitizes strings, error messages, and payload strings to ensure
 * secrets (API keys, authorization headers, tokens) are never leaked.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/(x-service-key['":\s]+)[^\s,'"]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[^\s,'"]+/gi, '$1[REDACTED]')
    .replace(/(secret['":\s]+)[^\s,'"]+/gi, '$1[REDACTED]')
    .replace(/(serviceKey['":\s]+)[^\s,'"]+/gi, '$1[REDACTED]')
    .replace(/(password['":\s]+)[^\s,'"]+/gi, '$1[REDACTED]');
}

/**
 * Base class for all SEEAKK server-to-server integration errors.
 */
export class SeeakkIntegrationError extends Error {
  public readonly statusCode: number;
  public readonly correlationId?: string;
  public readonly endpoint?: string;

  constructor(message: string, statusCode: number = 500, correlationId?: string, endpoint?: string) {
    super(redactSecrets(message));
    this.name = 'SeeakkIntegrationError';
    this.statusCode = statusCode;
    this.correlationId = correlationId;
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a user-safe message suitable for display in administrator UI notifications
   * without exposing internal endpoints, stack traces, or credentials.
   */
  public toSafeUserMessage(): string {
    return 'The external SEEAKK service encountered an error while processing the request.';
  }
}

export class SeeakkConfigError extends SeeakkIntegrationError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'SeeakkConfigError';
  }

  public override toSafeUserMessage(): string {
    return 'SEEAKK integration service is not properly configured. Please verify server environment variables.';
  }
}

export class SeeakkAuthError extends SeeakkIntegrationError {
  constructor(message: string = 'Authentication failed with SEEAKK platform API.', correlationId?: string, endpoint?: string) {
    super(message, 401, correlationId, endpoint);
    this.name = 'SeeakkAuthError';
  }

  public override toSafeUserMessage(): string {
    return 'Authentication with SEEAKK platform API failed. The platform service key may be invalid or expired.';
  }
}

export class SeeakkForbiddenError extends SeeakkIntegrationError {
  constructor(message: string = 'Forbidden from accessing requested SEEAKK resource.', correlationId?: string, endpoint?: string) {
    super(message, 403, correlationId, endpoint);
    this.name = 'SeeakkForbiddenError';
  }

  public override toSafeUserMessage(): string {
    return 'Access to the requested SEEAKK platform resource was denied by access control policies.';
  }
}

export class SeeakkNotFoundError extends SeeakkIntegrationError {
  constructor(message: string = 'The requested resource was not found on the SEEAKK platform.', correlationId?: string, endpoint?: string) {
    super(message, 404, correlationId, endpoint);
    this.name = 'SeeakkNotFoundError';
  }

  public override toSafeUserMessage(): string {
    return 'The requested company, workspace, or payment record was not found on the SEEAKK platform.';
  }
}

export class SeeakkValidationError extends SeeakkIntegrationError {
  public readonly validationErrors?: Record<string, unknown>;

  constructor(message: string, validationErrors?: Record<string, unknown>, correlationId?: string, endpoint?: string) {
    super(message, 422, correlationId, endpoint);
    this.name = 'SeeakkValidationError';
    this.validationErrors = validationErrors;
  }

  public override toSafeUserMessage(): string {
    return 'Invalid data was rejected by the SEEAKK platform or failed response contract validation.';
  }
}

export class SeeakkClientError extends SeeakkIntegrationError {
  constructor(message: string, statusCode: number = 400, correlationId?: string, endpoint?: string) {
    super(message, statusCode, correlationId, endpoint);
    this.name = 'SeeakkClientError';
  }

  public override toSafeUserMessage(): string {
    return `SEEAKK platform rejected the request (Status ${this.statusCode}). Check request parameters.`;
  }
}

export class SeeakkServerError extends SeeakkIntegrationError {
  constructor(message: string, statusCode: number = 500, correlationId?: string, endpoint?: string) {
    super(message, statusCode, correlationId, endpoint);
    this.name = 'SeeakkServerError';
  }

  public override toSafeUserMessage(): string {
    return 'The SEEAKK platform server experienced an internal failure. The operation may be retried.';
  }
}

export class SeeakkTimeoutError extends SeeakkIntegrationError {
  constructor(endpoint?: string, correlationId?: string) {
    super(`Request to SEEAKK API timed out after 10000ms.`, 504, correlationId, endpoint);
    this.name = 'SeeakkTimeoutError';
  }

  public override toSafeUserMessage(): string {
    return 'The SEEAKK platform service did not respond within the 10-second timeout limit.';
  }
}

export class SeeakkNetworkError extends SeeakkIntegrationError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error, correlationId?: string, endpoint?: string) {
    super(message, 503, correlationId, endpoint);
    this.name = 'SeeakkNetworkError';
    this.originalError = originalError;
  }

  public override toSafeUserMessage(): string {
    return 'Network connectivity failure: Unable to establish an HTTPS connection to the SEEAKK platform.';
  }
}
