import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { AdminSession } from '@/types/auth';
import { AuditAction } from '@prisma/client';

export interface RecordAuditParams {
  session?: AdminSession | null;
  adminEmail?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditLogWithAdmin = {
  id: string;
  adminId: string | null;
  adminEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  admin: {
    name: string;
    email: string;
    role: { name: string };
  } | null;
};

export class AuditService {
  /**
   * Records an audit log entry.
   * Strips any sensitive fields (like passwords, keys) to guarantee no secrets are stored.
   */
  static async record(params: RecordAuditParams): Promise<void> {
    const adminEmail =
      params.session?.email || params.adminEmail || 'system@control.seeakk.internal';
    const adminId = params.session?.id || null;

    // Sanitize old and new values to prevent sensitive credential storage
    const sanitize = (val?: Record<string, unknown> | null) => {
      if (!val) return null;
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        const lower = k.toLowerCase();
        if (
          lower.includes('secret') ||
          lower.includes('key') ||
          lower.includes('token') ||
          lower.includes('password') ||
          lower.includes('auth')
        ) {
          continue; // Strip sensitive fields from audit logs
        }
        sanitized[k] = v;
      }
      return sanitized as object;
    };

    await safeDbQuery(
      () =>
        prisma.auditLog.create({
          data: {
            adminId,
            adminEmail,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            oldValue: sanitize(params.oldValue) ?? undefined,
            newValue: sanitize(params.newValue) ?? undefined,
            metadata: (params.metadata as object) ?? undefined,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
          },
        }),
      null
    );
  }

  static async getRecentLogs(limit: number = 50): Promise<AuditLogWithAdmin[]> {
    return safeDbQuery<AuditLogWithAdmin[]>(
      () =>
        prisma.auditLog.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: {
              select: {
                name: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
        }) as Promise<AuditLogWithAdmin[]>,
      [] as AuditLogWithAdmin[]
    );
  }

  static async getLogsForEntity(entityType: string, entityId: string) {
    return safeDbQuery(
      () =>
        prisma.auditLog.findMany({
          where: { entityType, entityId },
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
      []
    );
  }
}
