export interface DashboardMetrics {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  gracePeriodCompanies: number;
  suspendedCompanies: number;
  payingCompanies: number;
  mrr: number;
  totalAmountReceived: number;
  totalAmountDue: number;
  overdueAmount: number;
  companiesApproachingLimitsCount: number;
  companiesExceedingLimitsCount: number;
  currency: string;
}

export interface MetricTrendItem {
  period: string;
  revenue: number;
  newCompanies: number;
}
