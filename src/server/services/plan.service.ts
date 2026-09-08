import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { PlanDTO } from '@/types/entitlement';
import { AdminSession } from '@/types/auth';
import { AuditService } from './audit.service';
import { AuditAction } from '@prisma/client';

export class PlanService {
  static async getPlans(): Promise<PlanDTO[]> {
    return safeDbQuery(
      async () => {
        const plans = await prisma.plan.findMany({
          orderBy: { sortOrder: 'asc' },
          include: {
            entitlements: true,
            _count: {
              select: {
                subscriptions: {
                  where: { status: { in: ['ACTIVE', 'TRIALING'] } },
                },
              },
            },
          },
        });

        return plans.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          billingInterval: p.billingInterval as 'MONTHLY' | 'ANNUAL',
          price: p.price,
          currency: p.currency,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
          activeCompaniesCount: p._count.subscriptions,
          entitlements: p.entitlements.map((e) => ({
            key: e.key,
            type: e.type,
            numericValue: e.numericValue,
            booleanValue: e.booleanValue,
          })),
        }));
      },
      []
    );
  }

  static async updatePlan(
    params: {
      planId: string;
      name: string;
      description?: string | null;
      price: number;
      billingInterval: 'MONTHLY' | 'ANNUAL';
      isActive: boolean;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const oldPlan = await prisma.plan.findUnique({ where: { id: params.planId } });
        const updated = await prisma.plan.update({
          where: { id: params.planId },
          data: {
            name: params.name,
            description: params.description,
            price: params.price,
            billingInterval: params.billingInterval,
            isActive: params.isActive,
          },
        });

        await AuditService.record({
          session,
          action: AuditAction.PLAN_UPDATED,
          entityType: 'Plan',
          entityId: params.planId,
          oldValue: oldPlan ? { price: oldPlan.price, name: oldPlan.name } : null,
          newValue: { price: params.price, name: params.name },
        });

        return updated;
      },
      null
    );
  }
}
