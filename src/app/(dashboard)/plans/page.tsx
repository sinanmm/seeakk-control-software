import * as React from 'react';
import { PlanService } from '@/server/services/plan.service';
import { PageHeader } from '@/components/layout/page-header';
import { PlansView } from '@/features/plans/components/plans-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const plans = await PlanService.getPlans();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans & Default Entitlements"
        description="Database-driven tier structures governing baseline customer user seats, lead capacity, imports, storage, and feature toggles."
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="No plans configured yet"
          description="Initialize database seed data with 'npm run db:seed' to populate standard Starter, Growth, and Enterprise tiers."
        />
      ) : (
        <PlansView plans={plans} />
      )}
    </div>
  );
}
