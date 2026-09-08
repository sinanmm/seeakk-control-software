import * as React from 'react';
import { CompanyService } from '@/server/services/company.service';
import { PlanService } from '@/server/services/plan.service';
import { PageHeader } from '@/components/layout/page-header';
import { CompanyTableView } from '@/features/companies/components/company-table-view';
import { CompanyStatus, Environment } from '@/types/company';

export const dynamic = 'force-dynamic';

interface CompaniesPageProps {
  searchParams: {
    search?: string;
    status?: string;
    env?: string;
    page?: string;
  };
}

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const page = searchParams.page ? parseInt(searchParams.page, 10) : 1;
  const status = searchParams.status as CompanyStatus | undefined;
  const env = searchParams.env as Environment | undefined;
  const search = searchParams.search;

  const [companiesResult, plans] = await Promise.all([
    CompanyService.getCompanies({
      search,
      status,
      environment: env,
      page,
      pageSize: 15,
    }),
    PlanService.getPlans(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Companies"
        description="Comprehensive directory of customer organizations, tenancy status, subscriptions, and active resource utilization."
      />

      <CompanyTableView
        companies={companiesResult.items}
        total={companiesResult.total}
        page={companiesResult.page}
        pageSize={companiesResult.pageSize}
        totalPages={companiesResult.totalPages}
        plans={plans}
      />
    </div>
  );
}
