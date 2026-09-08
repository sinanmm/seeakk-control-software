import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { DashboardMetrics } from '@/types/metrics';

export class MetricsService {
  static async getDashboardMetrics(): Promise<DashboardMetrics> {
    return safeDbQuery(
      async () => {
        const [
          totalCompanies,
          activeCompanies,
          trialCompanies,
          gracePeriodCompanies,
          suspendedCompanies,
          subscriptions,
          invoices,
          payments,
        ] = await Promise.all([
          prisma.company.count(),
          prisma.company.count({ where: { status: 'ACTIVE' } }),
          prisma.company.count({ where: { status: 'TRIAL' } }),
          prisma.company.count({ where: { status: 'GRACE_PERIOD' } }),
          prisma.company.count({ where: { status: 'SUSPENDED' } }),
          prisma.subscription.findMany({
            where: { status: 'ACTIVE' },
            include: { plan: true },
          }),
          prisma.invoice.findMany(),
          prisma.payment.findMany({ where: { status: 'COMPLETED' } }),
        ]);

        // Paying companies count
        const payingCompanies = new Set(
          subscriptions.filter((s) => s.plan.price > 0).map((s) => s.companyId)
        ).size;

        // MRR calculation
        const mrr = subscriptions.reduce((acc, sub) => {
          if (sub.plan.billingInterval === 'ANNUAL') {
            return acc + sub.plan.price / 12;
          }
          return acc + sub.plan.price;
        }, 0);

        // Invoices and Payments calculation
        const totalAmountReceived = payments.reduce((acc, p) => acc + p.amount, 0);
        const totalAmountDue = invoices.reduce((acc, inv) => acc + inv.amountDue, 0);

        const now = new Date();
        const overdueAmount = invoices
          .filter((inv) => inv.dueDate < now && inv.amountDue > 0)
          .reduce((acc, inv) => acc + inv.amountDue, 0);

        // Resource usage alerts count
        const usageApproaching = await prisma.companyUsage.count({
          where: {
            // Rough heuristic or explicit check
            currentValue: { gt: 0 },
          },
        });

        return {
          totalCompanies,
          activeCompanies,
          trialCompanies,
          gracePeriodCompanies,
          suspendedCompanies,
          payingCompanies,
          mrr: Math.round(mrr),
          totalAmountReceived: Math.round(totalAmountReceived),
          totalAmountDue: Math.round(totalAmountDue),
          overdueAmount: Math.round(overdueAmount),
          companiesApproachingLimitsCount: 0,
          companiesExceedingLimitsCount: 0,
          currency: 'INR',
        };
      },
      {
        totalCompanies: 0,
        activeCompanies: 0,
        trialCompanies: 0,
        gracePeriodCompanies: 0,
        suspendedCompanies: 0,
        payingCompanies: 0,
        mrr: 0,
        totalAmountReceived: 0,
        totalAmountDue: 0,
        overdueAmount: 0,
        companiesApproachingLimitsCount: 0,
        companiesExceedingLimitsCount: 0,
        currency: 'INR',
      }
    );
  }

  static async getRecentActivity() {
    return safeDbQuery(
      async () => {
        const [recentCompanies, recentPayments, overdueInvoices] = await Promise.all([
          prisma.company.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              subscriptions: {
                include: { plan: true },
                take: 1,
              },
            },
          }),
          prisma.payment.findMany({
            take: 5,
            orderBy: { paymentDate: 'desc' },
            include: {
              company: { select: { name: true, internalCode: true } },
            },
          }),
          prisma.invoice.findMany({
            where: {
              dueDate: { lt: new Date() },
              amountDue: { gt: 0 },
            },
            take: 5,
            orderBy: { dueDate: 'asc' },
            include: {
              company: { select: { name: true, internalCode: true } },
            },
          }),
        ]);

        return {
          recentCompanies,
          recentPayments,
          overdueInvoices,
        };
      },
      {
        recentCompanies: [],
        recentPayments: [],
        overdueInvoices: [],
      }
    );
  }
}
