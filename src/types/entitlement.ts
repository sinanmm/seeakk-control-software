export type EntitlementKey =
  | 'USERS'
  | 'LEADS'
  | 'LEAD_IMPORTS'
  | 'STORAGE_GB'
  | 'CUSTOM_DOMAINS'
  | 'API_ACCESS'
  | 'WEBHOOKS'
  | 'DEDICATED_SUPPORT';

export type EntitlementType = 'NUMERIC' | 'BOOLEAN';

export interface EffectiveEntitlement {
  key: EntitlementKey;
  label: string;
  type: EntitlementType;
  planDefault: number | boolean | null;
  override: number | boolean | null;
  effectiveValue: number | boolean;
  isOverridden: boolean;
  overrideReason?: string | null;
  overrideUpdatedAt?: Date | null;
  usage?: {
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
    warningState: 'NORMAL' | 'APPROACHING' | 'EXCEEDED';
  };
}

export interface PlanDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  price: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  activeCompaniesCount: number;
  entitlements: {
    key: EntitlementKey;
    type: EntitlementType;
    numericValue: number | null;
    booleanValue: boolean | null;
  }[];
}

export type AppModuleKey =
  | 'LEADS'
  | 'DEALS'
  | 'WHATSAPP'
  | 'AUTOMATION'
  | 'REPORTS'
  | 'CAMPAIGNS'
  | 'INTEGRATIONS';

export interface CompanyModuleOverrideDTO {
  id: string;
  companyId: string;
  moduleKey: AppModuleKey;
  isEnabled: boolean;
  reason: string;
  updatedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

