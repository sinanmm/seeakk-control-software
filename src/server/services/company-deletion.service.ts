import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { AdminSession } from '@/types/auth';
import { assertPermission, hasAnyPermission } from '@/lib/auth/permissions';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { SeeakkNotFoundError, SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';
import { AuditService } from './audit.service';
import { AuditAction, CompanyStatus } from '@prisma/client';

export interface CompanyDeletionResult {
  success: boolean;
  message: string;
  companyId: string;
  workspaceId?: string | null;
  remoteWorkspaceDeleted?: boolean;
  storageObjectsDeleted?: number;
  error?: string;
  statusCode?: number;
}

// In-memory set of company IDs currently being deleted to prevent concurrent race conditions
const inFlightDeletions = new Set<string>();

export class CompanyDeletionService {
  /**
   * Canonical backend service responsible for permanently deleting a Company and its
   * associated SEEAKK Workspace, CRM data, and Wasabi call recording objects.
   *
   * @param companyId The canonical Control Software Company ID (never accept workspaceId from frontend as authority)
   * @param session The authenticated administrator session initiating the deletion
   */
  static async deleteCompanyAndWorkspace(
    companyId: string,
    session: AdminSession | null | undefined
  ): Promise<CompanyDeletionResult> {
    // 1. Authenticate administrator and verify permissions
    if (!session || !session.id) {
      return {
        success: false,
        statusCode: 401,
        message: 'Unauthorized: Authentication required to perform company deletion.',
        companyId,
      };
    }

    // RBAC: Requires companies:delete or companies:write (Super Admin always has all permissions)
    const hasDeletePermission = hasAnyPermission(session, ['companies:delete', 'companies:write']);
    if (!hasDeletePermission) {
      return {
        success: false,
        statusCode: 403,
        message: 'Forbidden: Missing explicit permission to permanently delete companies.',
        companyId,
      };
    }

    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid company ID provided for deletion.',
        companyId,
      };
    }

    const cleanCompanyId = companyId.trim();

    // 2. Concurrency guard: block duplicate in-flight deletion requests
    if (inFlightDeletions.has(cleanCompanyId)) {
      return {
        success: false,
        statusCode: 409,
        message: 'Company deletion is already in progress for this tenant.',
        companyId: cleanCompanyId,
      };
    }

    inFlightDeletions.add(cleanCompanyId);

    try {
      // 3. Resolve Company from database
      const company = await prisma.company.findUnique({
        where: { id: cleanCompanyId },
      });

      if (!company) {
        return {
          success: false,
          statusCode: 404,
          message: 'Company not found.',
          companyId: cleanCompanyId,
        };
      }

      // 4. If company is already marked as CANCELLED or deleted
      if (company.status === CompanyStatus.CANCELLED && !company.workspaceId) {
        return {
          success: false,
          statusCode: 409,
          message: 'Company has already been cancelled and decommissioned.',
          companyId: cleanCompanyId,
        };
      }

      const workspaceId = company.workspaceId?.trim() || null;
      let remoteWorkspaceDeleted = false;
      let storageObjectsDeleted = 0;

      // 5. If company is bound to a SEEAKK workspace, invoke remote platform deletion
      if (workspaceId) {
        const client = new SeeakkApiClient(company.environment);
        const correlationId = `del_comp_${cleanCompanyId}_${Date.now()}`;
        const idempotencyKey = `idemp_del_${cleanCompanyId}_${workspaceId}`;

        try {
          const remoteResponse = await client.deleteCompany(workspaceId, {
            correlationId,
            idempotencyKey,
          });

          if (!remoteResponse.success) {
            return {
              success: false,
              statusCode: 502,
              message:
                remoteResponse.message ||
                'Remote platform rejected workspace deletion. Deletion aborted.',
              companyId: cleanCompanyId,
              workspaceId,
            };
          }

          remoteWorkspaceDeleted = true;
          storageObjectsDeleted = (remoteResponse as any).storageObjectsDeleted ?? 0;
        } catch (remoteErr: any) {
          const rawMessage = remoteErr?.message || '';
          const isRouteMissing =
            rawMessage.includes('Not Found - /api/') ||
            rawMessage.includes('Cannot DELETE') ||
            rawMessage.toLowerCase().includes('route not found');

          // If the endpoint itself is missing or unreachable, abort with 502 error
          if (isRouteMissing) {
            return {
              success: false,
              statusCode: 502,
              message:
                'Failed to delete remote workspace: The deletion endpoint is not available or not deployed on the target CRM platform.',
              companyId: cleanCompanyId,
              workspaceId,
            };
          }

          // If the workspace was explicitly confirmed not found by the CRM service
          const isExplicitWorkspaceNotFound =
            rawMessage.toLowerCase().includes('workspace not found');

          if (isExplicitWorkspaceNotFound) {
            // Workspace does not exist in CRM database; proceed with local cleanup
            remoteWorkspaceDeleted = false;
          } else if (remoteErr.statusCode === 409) {
            return {
              success: false,
              statusCode: 409,
              message: 'Workspace deletion is already in progress on the SEEAKK platform.',
              companyId: cleanCompanyId,
              workspaceId,
            };
          } else {
            // Remote platform or Wasabi deletion failed: surface error and abort local database deletion
            const sanitizedMessage = redactSecrets(rawMessage || 'Remote platform deletion failed');
            return {
              success: false,
              statusCode: remoteErr.statusCode || 502,
              message: `Failed to delete remote workspace and storage recordings: ${sanitizedMessage}`,
              companyId: cleanCompanyId,
              workspaceId,
            };
          }
        }
      }

      // 6. Database Transaction: Permanently delete Company and dependent records in Control DB
      await prisma.$transaction(async (tx) => {
        // Delete dependent commercial records (subscriptions, overrides, usage, invoices, payments, etc.)
        // Note: Prisma cascade onDelete handles subscriptions, overrides, usage, gracePeriods, invoices, payments,
        // and paymentProofRequests automatically as defined in schema.prisma.
        // Explicit deletion of company triggers transactional cascade.
        await tx.company.delete({
          where: { id: cleanCompanyId },
        });
      });

      // 7. Record sanitized administrative audit log in Control Software
      try {
        await AuditService.record({
          session,
          action: AuditAction.COMPANY_STATUS_CHANGED,
          entityType: 'Company',
          entityId: cleanCompanyId,
          oldValue: {
            name: company.name,
            internalCode: company.internalCode,
            slug: company.slug,
            workspaceId: company.workspaceId,
            environment: company.environment,
            status: company.status,
          },
          newValue: {
            deleted: true,
            status: 'PERMANENTLY_DELETED',
            deletedAt: new Date().toISOString(),
          },
          metadata: {
            actorAdminId: session.id,
            actorEmail: session.email,
            companyNameSnapshot: company.name,
            workspaceId: company.workspaceId,
            remoteWorkspaceDeleted,
            storageObjectsDeleted,
            action: 'DELETE_COMPANY_AND_WORKSPACE',
          },
        });
      } catch (auditErr: any) {
        console.warn('[CompanyDeletionService] Failed to record deletion audit event:', auditErr?.message);
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Company and workspace deleted successfully.',
        companyId: cleanCompanyId,
        workspaceId,
        remoteWorkspaceDeleted,
        storageObjectsDeleted,
      };
    } finally {
      inFlightDeletions.delete(cleanCompanyId);
    }
  }
}
