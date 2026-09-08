'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { assertPermission } from '@/lib/auth/permissions';
import { CompanyService } from '@/server/services/company.service';
import {
  createCompanySchema,
  updateCompanyStatusSchema,
  setEntitlementOverrideSchema,
  removeEntitlementOverrideSchema,
  manageGracePeriodSchema,
  revokeGracePeriodSchema,
} from '@/lib/validation/schemas';
import { CompanyStatus, Environment } from '@/types/company';
import { EntitlementKey, EntitlementType } from '@prisma/client';

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

export async function manageGracePeriodAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'grace_period:manage');

  const rawData = {
    companyId: formData.get('companyId') as string,
    days: Number(formData.get('days')),
    reason: formData.get('reason') as string,
    notes: (formData.get('notes') as string) || null,
  };

  const validated = manageGracePeriodSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Reason is required.' };
  }

  const result = await CompanyService.manageGracePeriod(validated.data, session!);
  if (!result) {
    return { success: false, error: 'Failed to configure grace period.' };
  }

  revalidatePath(`/companies/${validated.data.companyId}`);
  revalidatePath('/companies');
  return { success: true };
}

export async function revokeGracePeriodAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'grace_period:manage');

  const companyId = formData.get('companyId') as string;
  const reason = formData.get('reason') as string;

  const validated = revokeGracePeriodSchema.safeParse({ companyId, reason });
  if (!validated.success) {
    return { success: false, error: 'Validation failed.' };
  }

  await CompanyService.revokeGracePeriod(companyId, reason, session!);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath('/companies');
  return { success: true };
}
