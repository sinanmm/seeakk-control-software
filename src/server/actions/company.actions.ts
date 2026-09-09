'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { assertPermission } from '@/lib/auth/permissions';
import { CompanyService } from '@/server/services/company.service';
import { CompanySyncService, CompanySyncSummary } from '@/server/services/company-sync.service';
import { SeeakkSyncService } from '@/server/services/seeakk-sync.service';
import { SeeakkApiClient } from '@/lib/seeakk-client/client';
import { AuditService } from '@/server/services/audit.service';
import { prisma } from '@/lib/db/prisma';
import {
  createCompanySchema,
  updateCompanyStatusSchema,
  setEntitlementOverrideSchema,
  removeEntitlementOverrideSchema,
  manageGracePeriodSchema,
  grantGracePeriodSchema,
  revokeGracePeriodSchema,
  lockCompanySchema,
  unlockCompanySchema,
  suspendCompanySchema,
  unsuspendCompanySchema,
  syncCompaniesSchema,
} from '@/lib/validation/schemas';
import { CompanyStatus, Environment, EntitlementKey, EntitlementType, AuditAction } from '@prisma/client';
import { SeeakkIntegrationError, redactSecrets } from '@/lib/seeakk-client/errors';

function getSyncService(env?: Environment | string) {
  return new SeeakkSyncService(new SeeakkApiClient(env || 'TEST'));
}

/**
 * Creates a new company in Control Software.
 */
export async function createCompanyAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:write');

  const rawData = {
    name: formData.get('name') as string,
    internalCode: formData.get('internalCode') as string,
    slug: formData.get('slug') as string,
    contactEmail: formData.get('contactEmail') as string,
    contactPhone: (formData.get('contactPhone') as string) || null,
    workspaceId: (formData.get('workspaceId') as string) || null,
    environment: (formData.get('environment') as Environment) || 'PRODUCTION',
    status: (formData.get('status') as CompanyStatus) || 'TRIAL',
    planId: formData.get('planId') as string,
    notes: (formData.get('notes') as string) || null,
  };

  const validated = createCompanySchema.safeParse(rawData);
  if (!validated.success) {
    return {
      success: false,
      error: 'Please correct form validation errors.',
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const result = await CompanyService.createCompany(validated.data, session!);
  if (!result) {
    return {
      success: false,
      error: 'Failed to create company. Ensure database connection is active and codes are unique.',
    };
  }

  revalidatePath('/companies');
  revalidatePath('/dashboard');
  return { success: true, companyId: result.id };
}

/**
 * Synchronizes companies from a target SEEAKK environment into Control Software.
 * Protected by 'sync:manage' permission.
 */
export async function syncCompaniesAction(
  rawEnv: Environment | string
): Promise<{ success: boolean; summary?: CompanySyncSummary; error?: string }> {
  const session = await getCurrentSession();
  assertPermission(session, 'sync:manage');

  const validated = syncCompaniesSchema.safeParse({ environment: rawEnv });
  if (!validated.success) {
    return {
      success: false,
      error: 'Invalid environment specified. Must be TEST, STAGING, or PRODUCTION.',
    };
  }

  const environment = validated.data.environment as Environment;

  try {
    const summary = await CompanySyncService.syncSeeakkCompanies(environment, {
      initiatedBy: session!.email,
    });

    await AuditService.record({
      session: session!,
      action: AuditAction.SYNC_EVENT_TRIGGERED,
      entityType: 'CompanySync',
      entityId: environment,
      metadata: {
        environment,
        created: summary.created,
        updated: summary.updated,
        unchanged: summary.unchanged,
        failed: summary.failed,
        total: summary.total,
      },
    });

    revalidatePath('/companies');
    revalidatePath('/dashboard');

    return { success: true, summary };
  } catch (err: any) {
    const safeMessage =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Company synchronization encountered an error. Please try again.';

    console.error(`[syncCompaniesAction] Failed:`, redactSecrets(err.message));
    return { success: false, error: safeMessage };
  }
}

/**
 * Locks a company workspace on SEEAKK platform and updates Control state.
 */
export async function lockCompanyAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:status');

  const rawData = {
    companyId: formData.get('companyId') as string,
    reason: formData.get('reason') as string,
  };

  const validated = lockCompanySchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required (min 3 characters).' };
  }

  const { companyId, reason } = validated.data;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).lockCompany(
        company.workspaceId,
        { reason, lockedBy: session!.email },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        status: CompanyStatus.SUSPENDED,
        notes: company.notes ? `${company.notes}\n[Locked]: ${reason}` : `[Locked]: ${reason}`,
      },
    });

    await AuditService.record({
      session: session!,
      action: AuditAction.COMPANY_STATUS_CHANGED,
      entityType: 'Company',
      entityId: companyId,
      oldValue: { status: company.status },
      newValue: { status: updated.status, locked: true, reason },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to lock workspace on the SEEAKK platform. Status unchanged.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Unlocks a company workspace on SEEAKK platform and restores Control state.
 */
export async function unlockCompanyAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:status');

  const validated = unlockCompanySchema.safeParse({
    companyId: formData.get('companyId') as string,
  });

  if (!validated.success) {
    return { success: false, error: 'Invalid company identifier.' };
  }

  const { companyId } = validated.data;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).unlockCompany(
        company.workspaceId,
        { unlockedBy: session!.email },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.ACTIVE },
    });

    await AuditService.record({
      session: session!,
      action: AuditAction.COMPANY_STATUS_CHANGED,
      entityType: 'Company',
      entityId: companyId,
      oldValue: { status: company.status },
      newValue: { status: updated.status, locked: false },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to unlock workspace on the SEEAKK platform.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Suspends a company workspace on SEEAKK platform.
 */
export async function suspendCompanyAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:status');

  const validated = suspendCompanySchema.safeParse({
    companyId: formData.get('companyId') as string,
    reason: formData.get('reason') as string,
  });

  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required (min 3 characters).' };
  }

  const { companyId, reason } = validated.data;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).suspendCompany(
        company.workspaceId,
        { reason, suspendedBy: session!.email },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.SUSPENDED },
    });

    await AuditService.record({
      session: session!,
      action: AuditAction.COMPANY_SUSPENDED,
      entityType: 'Company',
      entityId: companyId,
      oldValue: { status: company.status },
      newValue: { status: updated.status, reason },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to suspend workspace on the SEEAKK platform.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Unsuspends a company workspace on SEEAKK platform.
 */
export async function unsuspendCompanyAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:status');

  const validated = unsuspendCompanySchema.safeParse({
    companyId: formData.get('companyId') as string,
  });

  if (!validated.success) {
    return { success: false, error: 'Invalid company identifier.' };
  }

  const { companyId } = validated.data;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).unsuspendCompany(
        company.workspaceId,
        { unsuspendedBy: session!.email },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.ACTIVE },
    });

    await AuditService.record({
      session: session!,
      action: AuditAction.COMPANY_ACTIVATED,
      entityType: 'Company',
      entityId: companyId,
      oldValue: { status: company.status },
      newValue: { status: updated.status },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to unsuspend workspace on the SEEAKK platform.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Grants a grace period window on SEEAKK platform and updates Control records.
 */
export async function grantGracePeriodAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'grace_period:manage');

  const daysRaw = formData.get('days');
  const userLimitRaw = formData.get('allowedUserLimit');

  const rawData = {
    companyId: formData.get('companyId') as string,
    allowedUserLimit: userLimitRaw ? Number(userLimitRaw) : undefined,
    graceUntil: (formData.get('graceUntil') as string) || undefined,
    days: daysRaw ? Number(daysRaw) : undefined,
    reason: formData.get('reason') as string,
  };

  const validated = grantGracePeriodSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required (min 3 characters).' };
  }

  const { companyId, allowedUserLimit, reason } = validated.data;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscriptions: {
        include: { plan: { include: { entitlements: true } } },
        take: 1,
      },
    },
  });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  const now = new Date();
  let graceUntilDate: Date;

  if (validated.data.graceUntil) {
    graceUntilDate = new Date(validated.data.graceUntil);
    if (isNaN(graceUntilDate.getTime()) || graceUntilDate <= now) {
      return { success: false, error: 'Grace period end date must be in the future.' };
    }
  } else {
    const days = validated.data.days || 7;
    graceUntilDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // Derive allowed user limit if not provided
  const usersEnt = company.subscriptions[0]?.plan?.entitlements.find((e) => e.key === 'USERS');
  const finalUserLimit = allowedUserLimit || usersEnt?.numericValue || 10;

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).grantGrace(
        company.workspaceId,
        {
          allowedUserLimit: finalUserLimit,
          graceFrom: now.toISOString(),
          graceUntil: graceUntilDate.toISOString(),
          reason,
          grantedBy: session!.email,
        },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    // Update Control DB records
    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { status: CompanyStatus.GRACE_PERIOD },
      }),
      prisma.gracePeriod.updateMany({
        where: { companyId, isActive: true },
        data: { isActive: false },
      }),
      prisma.gracePeriod.create({
        data: {
          companyId,
          startDate: now,
          endDate: graceUntilDate,
          reason,
          isActive: true,
          createdByAdminId: session!.id,
        },
      }),
    ]);

    await AuditService.record({
      session: session!,
      action: AuditAction.GRACE_PERIOD_ENABLED,
      entityType: 'Company',
      entityId: companyId,
      newValue: {
        status: CompanyStatus.GRACE_PERIOD,
        graceUntil: graceUntilDate.toISOString(),
        allowedUserLimit: finalUserLimit,
        reason,
      },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to configure grace period on the SEEAKK platform.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Revokes an active grace period window on SEEAKK platform and updates Control.
 */
export async function revokeGracePeriodAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'grace_period:manage');

  const validated = revokeGracePeriodSchema.safeParse({
    companyId: formData.get('companyId') as string,
    reason: formData.get('reason') as string,
  });

  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required (min 3 characters).' };
  }

  const { companyId, reason } = validated.data;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    return { success: false, error: 'Target company not found in Control Software.' };
  }

  try {
    if (company.workspaceId) {
      await getSyncService(company.environment).revokeGrace(
        company.workspaceId,
        { reason, revokedBy: session!.email },
        { workspaceId: company.workspaceId, env: company.environment }
      );
    }

    await prisma.$transaction([
      prisma.gracePeriod.updateMany({
        where: { companyId, isActive: true },
        data: { isActive: false },
      }),
      prisma.company.update({
        where: { id: companyId },
        data: { status: CompanyStatus.ACTIVE },
      }),
    ]);

    await AuditService.record({
      session: session!,
      action: AuditAction.GRACE_PERIOD_REVOKED,
      entityType: 'Company',
      entityId: companyId,
      newValue: { status: CompanyStatus.ACTIVE, reason },
      metadata: { workspaceId: company.workspaceId, environment: company.environment },
    });

    revalidatePath(`/companies/${companyId}`);
    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    const safeMsg =
      err instanceof SeeakkIntegrationError
        ? err.toSafeUserMessage()
        : 'Failed to revoke grace period on the SEEAKK platform.';
    return { success: false, error: safeMsg };
  }
}

/**
 * Backward compatibility alias for manageGracePeriodAction.
 */
export async function manageGracePeriodAction(formData: FormData) {
  return grantGracePeriodAction(formData);
}

/**
 * Generic status update action.
 */
export async function updateCompanyStatusAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'companies:status');

  const rawData = {
    companyId: formData.get('companyId') as string,
    status: formData.get('status') as CompanyStatus,
    reason: formData.get('reason') as string,
  };

  const validated = updateCompanyStatusSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required.' };
  }

  const result = await CompanyService.updateStatus(
    validated.data.companyId,
    validated.data.status,
    validated.data.reason,
    session!
  );

  if (!result) {
    return { success: false, error: 'Failed to update company status.' };
  }

  revalidatePath(`/companies/${validated.data.companyId}`);
  revalidatePath('/companies');
  return { success: true };
}

/**
 * Entitlement overrides actions.
 */
export async function setEntitlementOverrideAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'entitlements:override');

  const rawType = formData.get('type') as EntitlementType;
  const numVal = formData.get('numericValue');
  const boolVal = formData.get('booleanValue');

  const rawData = {
    companyId: formData.get('companyId') as string,
    key: formData.get('key') as EntitlementKey,
    type: rawType,
    numericValue: numVal ? Number(numVal) : null,
    booleanValue: boolVal !== null && boolVal !== undefined ? boolVal === 'true' : null,
    reason: formData.get('reason') as string,
  };

  const validated = setEntitlementOverrideSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required.' };
  }

  const result = await CompanyService.setEntitlementOverride(
    {
      companyId: validated.data.companyId,
      key: validated.data.key,
      type: validated.data.type,
      numericValue: validated.data.numericValue,
      booleanValue: validated.data.booleanValue,
      reason: validated.data.reason,
    },
    session!
  );

  if (!result) {
    return { success: false, error: 'Failed to save entitlement override.' };
  }

  revalidatePath(`/companies/${validated.data.companyId}`);
  return { success: true };
}

export async function removeEntitlementOverrideAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'entitlements:override');

  const companyId = formData.get('companyId') as string;
  const key = formData.get('key') as EntitlementKey;
  const reason = formData.get('reason') as string;

  const validated = removeEntitlementOverrideSchema.safeParse({ companyId, key, reason });
  if (!validated.success) {
    return { success: false, error: 'Validation failed.' };
  }

  await CompanyService.removeEntitlementOverride(companyId, key, reason, session!);
  revalidatePath(`/companies/${companyId}`);
  return { success: true };
}
