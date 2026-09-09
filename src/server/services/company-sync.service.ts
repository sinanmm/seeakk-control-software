import { randomUUID } from 'crypto';
import { Environment, CompanyStatus, SyncDirection, SyncStatus, EntitlementKey } from '@prisma/client';
import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { SeeakkCompanyItem } from '@/lib/seeakk-client/contracts';
import {
  SeeakkIntegrationError,
  SeeakkValidationError,
  redactSecrets,
} from '@/lib/seeakk-client/errors';
import { sanitizePayloadForStorage } from './seeakk-sync.service';

export interface CompanySyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  total: number;
  environment: Environment;
  syncLogId?: string;
  errors?: string[];
}

/**
 * Creates a URL-friendly slug from a company name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'company';
}

/**
 * Maps remote SEEAKK workspace status flags to Control's CompanyStatus enum.
 */
export function mapSeeakkStatusToControlStatus(item: SeeakkCompanyItem): CompanyStatus {
  if (item.suspended || item.locked) {
    return CompanyStatus.SUSPENDED;
  }
  if (item.activeGrace) {
    return CompanyStatus.GRACE_PERIOD;
  }

  const rawBillingStatus = (item.billingStatus || '').toUpperCase();
  switch (rawBillingStatus) {
    case 'ACTIVE':
      return CompanyStatus.ACTIVE;
    case 'TRIAL':
      return CompanyStatus.TRIAL;
    case 'PAST_DUE':
    case 'EXPIRED':
      return CompanyStatus.PAST_DUE;
    case 'CANCELLED':
      return CompanyStatus.CANCELLED;
    default:
      return CompanyStatus.ACTIVE;
  }
}

export class CompanySyncService {
  /**
   * Synchronizes all workspaces from a specific SEEAKK environment into Control Software.
   *
   * Architectural Guarantees:
   * 1. Uses actual GET /api/internal/platform/companies with full pagination.
   * 2. Enforces environment isolation (workspaceId + environment uniqueness).
   * 3. Idempotent: repeated runs safely update without duplicating records.
   * 4. Strict field ownership: updates SEEAKK-owned fields without overwriting Control-owned fields.
   * 5. Never deletes existing Control records if absent from remote response.
   * 6. Records all sync runs in SystemSyncLog.
   */
  static async syncSeeakkCompanies(
    environment: Environment,
    options?: { initiatedBy?: string; client?: SeeakkApiClient }
  ): Promise<CompanySyncSummary> {
    const correlationId = `sync_comp_${environment}_${randomUUID()}`;
    const idempotencyKey = `comp_sync_${environment}_${Date.now()}`;

    // 1. Concurrency guard: check if an identical sync job is currently in-flight (< 30s)
    const inFlightLog = await prisma.systemSyncLog.findFirst({
      where: {
        eventType: 'companies.sync',
        direction: SyncDirection.INBOUND_FROM_SEEAKK,
        status: SyncStatus.PENDING,
        lastAttemptAt: {
          gte: new Date(Date.now() - 30000),
        },
      },
    });

    if (inFlightLog) {
      throw new SeeakkValidationError(
        `A company synchronization job for ${environment} is currently in-flight. Please wait a moment before retrying.`,
        undefined,
        correlationId
      );
    }

    // 2. Create initial PENDING sync log entry
    const syncLog = await prisma.systemSyncLog.create({
      data: {
        idempotencyKey,
        direction: SyncDirection.INBOUND_FROM_SEEAKK,
        eventType: 'companies.sync',
        status: SyncStatus.PENDING,
        retryCount: 0,
        requestPayload: {
          environment,
          initiatedBy: options?.initiatedBy || 'system',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const client = options?.client || new SeeakkApiClient(environment);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let total = 0;
    const errors: string[] = [];

    try {
      let currentPage = 1;
      let totalPages = 1;
      const pageSize = 50;

      // 3. Paginate through all remote companies from SEEAKK
      while (currentPage <= totalPages) {
        const response = await client.getCompanies({
          page: currentPage,
          limit: pageSize,
          correlationId,
        });

        if (!response.success || !Array.isArray(response.items)) {
          throw new SeeakkValidationError(
            `SEEAKK platform responded with invalid company list payload at page ${currentPage}`,
            undefined,
            correlationId
          );
        }

        totalPages = response.pagination.totalPages || 1;

        // Process each company item
        for (const item of response.items) {
          total++;
          try {
            const result = await this.upsertSingleCompany(item, environment);
            if (result === 'CREATED') created++;
            else if (result === 'UPDATED') updated++;
            else unchanged++;
          } catch (err: any) {
            failed++;
            const errMsg = `Failed to sync company ${item.id} (${item.companyName}): ${redactSecrets(err.message)}`;
            errors.push(errMsg);
            console.error(`[CompanySyncService] ${errMsg}`);
          }
        }

        currentPage++;
      }

      const summary: CompanySyncSummary = {
        created,
        updated,
        unchanged,
        failed,
        total,
        environment,
        syncLogId: syncLog.id,
        errors: errors.length > 0 ? errors : undefined,
      };

      // 4. Mark SystemSyncLog as SUCCESS
      await prisma.systemSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.SUCCESS,
          statusCode: 200,
          responsePayload: sanitizePayloadForStorage(summary),
          errorMessage: errors.length > 0 ? errors.join('; ') : null,
          updatedAt: new Date(),
        },
      });

      return summary;
    } catch (err: any) {
      const statusCode = err instanceof SeeakkIntegrationError ? err.statusCode : 500;
      const sanitizedError = redactSecrets(err?.message || 'Synchronization failed unexpectedly');

      if (syncLog?.id) {
        try {
          await prisma.systemSyncLog.update({
            where: { id: syncLog.id },
            data: {
              status: SyncStatus.FAILED,
              statusCode,
              errorMessage: sanitizedError,
              updatedAt: new Date(),
            },
          });
        } catch (updateErr) {
          console.error('[CompanySyncService] Failed to record error state in syncLog:', updateErr);
        }
      }

      throw err;
    }
  }

  /**
   * Safely upserts a single remote SEEAKK workspace into Control Software,
   * respecting environment isolation and strictly separating SEEAKK-owned
   * from Control-owned fields.
   */
  private static async upsertSingleCompany(
    item: SeeakkCompanyItem,
    environment: Environment
  ): Promise<'CREATED' | 'UPDATED' | 'UNCHANGED'> {
    const workspaceId = item.id;
    const targetStatus = mapSeeakkStatusToControlStatus(item);

    // Look up existing company using the compound unique constraint [workspaceId, environment]
    const existing = await prisma.company.findUnique({
      where: {
        workspaceId_environment: {
          workspaceId,
          environment,
        },
      },
      include: {
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          take: 1,
        },
        usageRecords: true,
        gracePeriods: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    const now = new Date();

    if (existing) {
      // -----------------------------------------------------------------------
      // EXISTING COMPANY: Update ONLY SEEAKK-owned fields.
      // NEVER overwrite Control-owned commercial plans, overrides, or notes!
      // -----------------------------------------------------------------------
      let hasChanges = false;
      const updateData: Record<string, any> = {};

      if (existing.name !== item.companyName) {
        updateData.name = item.companyName;
        hasChanges = true;
      }

      if (existing.status !== targetStatus) {
        updateData.status = targetStatus;
        hasChanges = true;
      }

      if (hasChanges) {
        await prisma.company.update({
          where: { id: existing.id },
          data: updateData,
        });
      }

      // Update or create usage record with SEEAKK active seat count
      const activeUserCount = item.activeUserCount ?? 0;
      await prisma.companyUsage.upsert({
        where: {
          companyId_metricKey: {
            companyId: existing.id,
            metricKey: EntitlementKey.USERS,
          },
        },
        update: {
          currentValue: activeUserCount,
          lastReportedAt: now,
        },
        create: {
          companyId: existing.id,
          metricKey: EntitlementKey.USERS,
          currentValue: activeUserCount,
          lastReportedAt: now,
        },
      });
      hasChanges = true;

      // Sync GracePeriod state if active on SEEAKK side
      if (item.activeGrace && item.graceUntil) {
        const remoteGraceEnd = new Date(item.graceUntil);
        const currentActiveGrace = existing.gracePeriods[0];

        if (!currentActiveGrace) {
          await prisma.gracePeriod.create({
            data: {
              companyId: existing.id,
              startDate: now,
              endDate: remoteGraceEnd,
              reason: 'Synchronized from SEEAKK platform grace window',
              isActive: true,
            },
          });
          hasChanges = true;
        }
      }

      return hasChanges ? 'UPDATED' : 'UNCHANGED';
    }

    // -------------------------------------------------------------------------
    // NEW COMPANY: Provision initial record with deterministic identifiers
    // -------------------------------------------------------------------------
    const codeSuffix = workspaceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    let internalCode = `CO-${codeSuffix}`;

    // Verify internalCode uniqueness in Control
    const existingCode = await prisma.company.findUnique({
      where: { internalCode },
    });
    if (existingCode) {
      internalCode = `CO-${codeSuffix}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const baseSlug = slugify(item.companyName);
    const envPrefix = environment.toLowerCase();
    const slugSuffix = workspaceId.slice(0, 6);
    let slug = `${baseSlug}-${envPrefix}-${slugSuffix}`;

    // Verify slug uniqueness
    const existingSlug = await prisma.company.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const contactEmail = `workspace-${workspaceId.slice(0, 8)}@seeakk.internal`;

    const newCompany = await prisma.company.create({
      data: {
        workspaceId,
        environment,
        name: item.companyName,
        internalCode,
        slug,
        contactEmail,
        status: targetStatus,
        createdAt: item.createdAt ? new Date(item.createdAt) : now,
      },
    });

    // Create initial usage record
    await prisma.companyUsage.create({
      data: {
        companyId: newCompany.id,
        metricKey: EntitlementKey.USERS,
        currentValue: item.activeUserCount ?? 0,
        lastReportedAt: now,
      },
    });

    // If SEEAKK payload includes an active plan, link to local matching Plan if found
    if (item.activePlan?.code) {
      const matchingPlan = await prisma.plan.findUnique({
        where: { code: item.activePlan.code.toUpperCase() },
      });

      if (matchingPlan) {
        await prisma.subscription.create({
          data: {
            companyId: newCompany.id,
            planId: matchingPlan.id,
            status: targetStatus === CompanyStatus.TRIAL ? 'TRIALING' : 'ACTIVE',
            currentPeriodStart: item.accessFrom ? new Date(item.accessFrom) : now,
            currentPeriodEnd: item.accessUntil
              ? new Date(item.accessUntil)
              : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    // Provision GracePeriod if remote is actively in grace
    if (item.activeGrace && item.graceUntil) {
      await prisma.gracePeriod.create({
        data: {
          companyId: newCompany.id,
          startDate: now,
          endDate: new Date(item.graceUntil),
          reason: 'Initial sync: Active grace window on SEEAKK platform',
          isActive: true,
        },
      });
    }

    return 'CREATED';
  }
}
