import * as React from 'react';
import { notFound } from 'next/navigation';
import { CompanyService } from '@/server/services/company.service';
import { PageHeader } from '@/components/layout/page-header';
import { CompanyStatusBadge, EnvironmentBadge } from '@/components/ui/status-badge';
import { CompanyDetailTabs } from '@/features/companies/components/company-detail-tabs';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface CompanyDetailPageProps {
  params: {
    id: string;
  };
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const result = await CompanyService.getCompanyById(params.id);

  if (!result) {
    notFound();
  }

  const { company, subscription, gracePeriod, effectiveEntitlements, invoices, payments } = result;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb / Back Link */}
      <div>
        <Link href="/companies">
          <Button variant="ghost" size="sm" className="-ml-3 text-zinc-400">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Companies Directory
          </Button>
        </Link>
      </div>

      {/* Header with Title and Badges */}
      <PageHeader
        title={company.name}
        description={`Internal ID: ${company.internalCode} • Slug: ${company.slug}`}
        badge={
          <div className="flex items-center gap-2">
            <CompanyStatusBadge status={company.status} />
            <EnvironmentBadge environment={company.environment} />
          </div>
        }
      />

      {/* Interactive Tabs */}
      <CompanyDetailTabs
        company={company}
        subscription={subscription}
        gracePeriod={gracePeriod}
        effectiveEntitlements={effectiveEntitlements}
        invoices={invoices}
        payments={payments}
      />
    </div>
  );
}
