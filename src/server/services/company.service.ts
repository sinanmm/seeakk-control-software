import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { CompanySummaryDTO, CompanyStatus, Environment } from '@/types/company';
import { EntitlementService } from './entitlement.service';
import { GracePeriodService } from './grace-period.service';
import { AuditService } from './audit.service';
import { AdminSession } from '@/types/auth';
import { AuditAction, EntitlementKey, EntitlementType } from '@prisma/client';

export interface CompanyListFilter {
  search?: string;
  status?: CompanyStatus;
  environment?: Environment;
  page?: number;
  pageSize?: number;
}

export interface CompanyListResult {
  items: CompanySummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class CompanyService {
  static async getCompanies(filter: CompanyListFilter = {}): Promise<CompanyListResult> {
    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize || 15));
    const skip = (page - 1) * pageSize;

    return safeDbQuery<CompanyListResult>(
      async () => {
        const where: Record<string, unknown> = {};

        if (filter.status) {
          where.status = filter.status;
        }

        if (filter.environment) {
          where.environment = filter.environment;
        }

        if (filter.search) {
          where.OR = [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { internalCode: { contains: filter.search, mode: 'insensitive' } },
            { contactEmail: { contains: filter.search, mode: 'insensitive' } },
          ];
        }

        const [total, items] = await Promise.all([
          prisma.company.count({ where }),
          prisma.company.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
            include: {
              subscriptions: {
                where: { status: { in: ['ACTIVE', 'TRIALING'] } },
                include: {
                  plan: {
                    include: { entitlements: true },
                  },
                },
                take: 1,
              },
              entitlementOverrides: true,
              usageRecords: true,
              gracePeriods: {
                where: { isActive: true },
                orderBy: { endDate: 'desc' },
                take: 1,
              },
            },
          }),
        ]);

        const formattedCompanies = items.map((c) => {
          const currentSub = c.subscriptions[0];
          const activeGrace = c.gracePeriods[0];
          const effectiveEntitlements = EntitlementService.computeEffectiveEntitlements(
            currentSub?.plan?.entitlements || [],
            c.entitlementOverrides,
            c.usageRecords
          );

          const usersEnt = effectiveEntitlements.find((e) => e.key === 'USERS');
          const leadsEnt = effectiveEntitlements.find((e) => e.key === 'LEADS');

          return {
            id: c.id,
            internalCode: c.internalCode,
            name: c.name,
            slug: c.slug,
            workspaceId: c.workspaceId,
            environment: c.environment,
            status: c.status,
            contactEmail: c.contactEmail,
            currentPlanName: currentSub?.plan?.name ?? 'No active plan',
            subscriptionStatus: currentSub?.status ?? null,
            gracePeriodDaysLeft: activeGrace
              ? GracePeriodService.getDaysRemaining(activeGrace)
              : null,
            usersUsed: usersEnt?.usage?.current ?? 0,
            usersLimit: typeof usersEnt?.effectiveValue === 'number' ? usersEnt.effectiveValue : 0,
            leadsUsed: leadsEnt?.usage?.current ?? 0,
            leadsLimit: typeof leadsEnt?.effectiveValue === 'number' ? leadsEnt.effectiveValue : 0,
            createdAt: c.createdAt,
          };
        });

        return {
          items: formattedCompanies,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      },
      {
        items: [] as CompanySummaryDTO[],
        total: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
      }
    );
  }

  static async getCompanyById(id: string) {
    return safeDbQuery(
      async () => {
        const company = await prisma.company.findUnique({
          where: { id },
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              include: {
                plan: {
                  include: { entitlements: true },
                },
              },
              take: 1,
            },
            entitlementOverrides: {
              orderBy: { updatedAt: 'desc' },
            },
            usageRecords: true,
            gracePeriods: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            invoices: {
              orderBy: { invoiceDate: 'desc' },
              include: { payments: true },
              take: 10,
            },
            payments: {
              orderBy: { paymentDate: 'desc' },
              take: 10,
            },
          },
        });

        if (!company) return null;

        const currentSub = company.subscriptions[0] || null;
        const activeGrace = company.gracePeriods.find((g) => g.isActive) || null;

        const effectiveEntitlements = EntitlementService.computeEffectiveEntitlements(
          currentSub?.plan?.entitlements || [],
          company.entitlementOverrides,
          company.usageRecords
        );

        return {
          company: {
            id: company.id,
            internalCode: company.internalCode,
            name: company.name,
            slug: company.slug,
            workspaceId: company.workspaceId,
            environment: company.environment,
            status: company.status,
            contactEmail: company.contactEmail,
            contactPhone: company.contactPhone,
            billingAddress: company.billingAddress,
            notes: company.notes,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
          },
          subscription: currentSub
            ? {
                id: currentSub.id,
                planId: currentSub.planId,
                planName: currentSub.plan.name,
                planCode: currentSub.plan.code,
                price: currentSub.plan.price,
                currency: currentSub.plan.currency,
                billingInterval: currentSub.plan.billingInterval,
                status: currentSub.status,
                currentPeriodStart: currentSub.currentPeriodStart,
                currentPeriodEnd: currentSub.currentPeriodEnd,
                cancelAtPeriodEnd: currentSub.cancelAtPeriodEnd,
              }
            : null,
          gracePeriod: activeGrace
            ? {
                id: activeGrace.id,
                isActive: activeGrace.isActive,
                startDate: activeGrace.startDate,
                endDate: activeGrace.endDate,
                daysRemaining: GracePeriodService.getDaysRemaining(activeGrace),
                reason: activeGrace.reason,
                notes: activeGrace.notes,
              }
            : null,
          gracePeriodHistory: company.gracePeriods,
          effectiveEntitlements,
          invoices: company.invoices,
          payments: company.payments,
        };
      },
      null
    );
  }

  static async createCompany(
    data: {
      name: string;
      internalCode: string;
      slug: string;
      contactEmail: string;
      contactPhone?: string | null;
      workspaceId?: string | null;
      environment: Environment;
      status: CompanyStatus;
      planId: string;
      notes?: string | null;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const plan = await prisma.plan.findUnique({
          where: { id: data.planId },
          include: { entitlements: true },
        });

        if (!plan) throw new Error('Selected plan not found');

        const now = new Date();
        const periodEnd = new Date();
        periodEnd.setMonth(now.getMonth() + (plan.billingInterval === 'ANNUAL' ? 12 : 1));

        const newCompany = await prisma.company.create({
          data: {
            name: data.name,
            internalCode: data.internalCode,
            slug: data.slug,
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone,
            workspaceId: data.workspaceId,
            environment: data.environment,
            status: data.status,
            notes: data.notes,
            subscriptions: {
              create: {
                planId: plan.id,
                status: data.status === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
              },
            },
            usageRecords: {
              create: [
                { metricKey: EntitlementKey.USERS, currentValue: 1 },
                { metricKey: EntitlementKey.LEADS, currentValue: 0 },
                { metricKey: EntitlementKey.LEAD_IMPORTS, currentValue: 0 },
                { metricKey: EntitlementKey.STORAGE_GB, currentValue: 0.1 },
              ],
            },
          },
        });

        await AuditService.record({
          session,
          action: AuditAction.COMPANY_CREATED,
          entityType: 'Company',
          entityId: newCompany.id,
          newValue: {
            name: newCompany.name,
            internalCode: newCompany.internalCode,
            plan: plan.name,
            status: newCompany.status,
          },
        });

        return newCompany;
      },
      null
    );
  }

  static async updateStatus(
    companyId: string,
    newStatus: CompanyStatus,
    reason: string,
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) throw new Error('Company not found');

        const oldStatus = company.status;
        const updated = await prisma.company.update({
          where: { id: companyId },
          data: { status: newStatus },
        });

        await AuditService.record({
          session,
          action:
            newStatus === 'SUSPENDED'
              ? AuditAction.COMPANY_SUSPENDED
              : newStatus === 'ACTIVE'
              ? AuditAction.COMPANY_ACTIVATED
              : AuditAction.COMPANY_STATUS_CHANGED,
          entityType: 'Company',
          entityId: companyId,
          oldValue: { status: oldStatus },
          newValue: { status: newStatus },
          metadata: { reason },
        });

        return updated;
      },
      null
    );
  }

  static async setEntitlementOverride(
    params: {
      companyId: string;
      key: EntitlementKey;
      type: EntitlementType;
      numericValue?: number | null;
      booleanValue?: boolean | null;
      reason: string;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const override = await prisma.companyEntitlementOverride.upsert({
          where: {
            companyId_key: {
              companyId: params.companyId,
              key: params.key,
            },
          },
          update: {
            numericValue: params.numericValue,
            booleanValue: params.booleanValue,
            reason: params.reason,
            updatedByAdminId: session.id,
          },
          create: {
            companyId: params.companyId,
            key: params.key,
            type: params.type,
            numericValue: params.numericValue,
            booleanValue: params.booleanValue,
            reason: params.reason,
            updatedByAdminId: session.id,
          },
        });

        await AuditService.record({
          session,
          action: AuditAction.ENTITLEMENT_OVERRIDE_SET,
          entityType: 'CompanyEntitlementOverride',
          entityId: override.id,
          newValue: {
            companyId: params.companyId,
            key: params.key,
            value: params.numericValue ?? params.booleanValue,
            reason: params.reason,
          },
        });

        return override;
      },
      null
    );
  }

  static async removeEntitlementOverride(
    companyId: string,
    key: EntitlementKey,
    reason: string,
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        await prisma.companyEntitlementOverride.deleteMany({
          where: { companyId, key },
        });

        await AuditService.record({
          session,
          action: AuditAction.ENTITLEMENT_OVERRIDE_REMOVED,
          entityType: 'CompanyEntitlementOverride',
          entityId: `${companyId}_${key}`,
          metadata: { key, reason },
        });

        return true;
      },
      false
    );
  }

  static async manageGracePeriod(
    params: {
      companyId: string;
      days: number;
      reason: string;
      notes?: string | null;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + params.days);

        // Deactivate previous grace periods
        await prisma.gracePeriod.updateMany({
          where: { companyId: params.companyId, isActive: true },
          data: { isActive: false },
        });

        const grace = await prisma.gracePeriod.create({
          data: {
            companyId: params.companyId,
            isActive: true,
            startDate: now,
            endDate,
            reason: params.reason,
            notes: params.notes,
            createdByAdminId: session.id,
          },
        });

        // Set company status to GRACE_PERIOD
        await prisma.company.update({
          where: { id: params.companyId },
          data: { status: 'GRACE_PERIOD' },
        });

        await AuditService.record({
          session,
          action: AuditAction.GRACE_PERIOD_ENABLED,
          entityType: 'GracePeriod',
          entityId: grace.id,
          newValue: {
            days: params.days,
            endDate,
            reason: params.reason,
          },
        });

        return grace;
      },
      null
    );
  }

  static async revokeGracePeriod(
    companyId: string,
    reason: string,
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        await prisma.gracePeriod.updateMany({
          where: { companyId, isActive: true },
          data: { isActive: false },
        });

        await AuditService.record({
          session,
          action: AuditAction.GRACE_PERIOD_REVOKED,
          entityType: 'GracePeriod',
          entityId: companyId,
          metadata: { reason },
        });

        return true;
      },
      false
    );
  }
}
