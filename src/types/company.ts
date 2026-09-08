export type CompanyStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED';

export type Environment = 'PRODUCTION' | 'STAGING' | 'TEST';

export interface CompanySummaryDTO {
  id: string;
  internalCode: string;
  name: string;
  slug: string;
  workspaceId: string | null;
  environment: Environment;
  status: CompanyStatus;
  contactEmail: string;
  currentPlanName: string | null;
  subscriptionStatus: string | null;
  gracePeriodDaysLeft: number | null;
  usersUsed: number;
  usersLimit: number;
  leadsUsed: number;
  leadsLimit: number;
  createdAt: Date;
}

export interface CompanyDetailDTO {
  id: string;
  internalCode: string;
  name: string;
  slug: string;
  workspaceId: string | null;
  environment: Environment;
  status: CompanyStatus;
  contactEmail: string;
  contactPhone: string | null;
  billingAddress: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  subscription: {
    id: string;
    planId: string;
    planName: string;
    planCode: string;
    price: number;
    currency: string;
    billingInterval: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
  gracePeriod: {
    id: string;
    isActive: boolean;
    startDate: Date;
    endDate: Date;
    daysRemaining: number;
    reason: string;
    notes: string | null;
  } | null;
}
