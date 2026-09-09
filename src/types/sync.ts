export type SyncDirection = 'INBOUND_FROM_SEEAKK' | 'OUTBOUND_TO_SEEAKK';
export type SyncStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';

export interface SystemSyncLogDTO {
  id: string;
  idempotencyKey: string;
  direction: SyncDirection;
  eventType: string;
  workspaceId: string | null;
  companyId: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  statusCode: number | null;
  status: SyncStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  lastAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
