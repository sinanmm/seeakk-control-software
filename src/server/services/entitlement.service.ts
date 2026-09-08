import { EntitlementKey, EntitlementType, EffectiveEntitlement } from '@/types/entitlement';

export interface RawPlanEntitlement {
  key: EntitlementKey;
  type: EntitlementType;
  numericValue: number | null;
  booleanValue: boolean | null;
}

export interface RawOverride {
  key: EntitlementKey;
  type: EntitlementType;
  numericValue: number | null;
  booleanValue: boolean | null;
  reason: string;
  updatedAt: Date;
}

export interface RawUsage {
  metricKey: EntitlementKey;
  currentValue: number;
}

const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  USERS: 'User Seats',
  LEADS: 'Total Leads Limit',
  LEAD_IMPORTS: 'Monthly Lead Imports',
  STORAGE_GB: 'Storage Capacity (GB)',
  CUSTOM_DOMAINS: 'Custom Sending Domains',
  API_ACCESS: 'API Access',
  WEBHOOKS: 'Webhook Subscriptions',
  DEDICATED_SUPPORT: 'Dedicated Account Manager',
};

export class EntitlementService {
  /**
   * Pure calculation: Merges Plan Defaults + Company Overrides -> Effective Entitlements
   * and attaches usage calculation and warning indicators.
   */
  static computeEffectiveEntitlements(
    planEntitlements: RawPlanEntitlement[],
    overrides: RawOverride[],
    usages: RawUsage[]
  ): EffectiveEntitlement[] {
    const overrideMap = new Map<EntitlementKey, RawOverride>();
    for (const ov of overrides) {
      overrideMap.set(ov.key, ov);
    }

    const usageMap = new Map<EntitlementKey, number>();
    for (const u of usages) {
      usageMap.set(u.metricKey, u.currentValue);
    }

    // Standard list of keys to present
    const standardKeys: EntitlementKey[] = [
      'USERS',
      'LEADS',
      'LEAD_IMPORTS',
      'STORAGE_GB',
      'API_ACCESS',
      'CUSTOM_DOMAINS',
      'WEBHOOKS',
      'DEDICATED_SUPPORT',
    ];

    const planMap = new Map<EntitlementKey, RawPlanEntitlement>();
    for (const pe of planEntitlements) {
      planMap.set(pe.key, pe);
    }

    return standardKeys.map((key) => {
      const planItem = planMap.get(key);
      const overrideItem = overrideMap.get(key);
      const isNumeric = key === 'USERS' || key === 'LEADS' || key === 'LEAD_IMPORTS' || key === 'STORAGE_GB';
      const type: EntitlementType = isNumeric ? 'NUMERIC' : 'BOOLEAN';

      // Default values if not explicitly in plan
      let planDefault: number | boolean | null = null;
      if (planItem) {
        planDefault = isNumeric ? (planItem.numericValue ?? 0) : (planItem.booleanValue ?? false);
      } else {
        planDefault = isNumeric ? 0 : false;
      }

      let overrideVal: number | boolean | null = null;
      if (overrideItem) {
        overrideVal = isNumeric
          ? overrideItem.numericValue
          : overrideItem.booleanValue;
      }

      const isOverridden = overrideVal !== null && overrideVal !== undefined;
      const effectiveValue = isOverridden ? overrideVal! : planDefault;

      let usageData: EffectiveEntitlement['usage'] = undefined;
      if (isNumeric) {
        const current = usageMap.get(key) ?? 0;
        const limit = typeof effectiveValue === 'number' ? effectiveValue : 0;
        const remaining = Math.max(0, limit - current);
        const percentage = limit > 0 ? (current / limit) * 100 : 0;

        let warningState: 'NORMAL' | 'APPROACHING' | 'EXCEEDED' = 'NORMAL';
        if (percentage >= 100) {
          warningState = 'EXCEEDED';
        } else if (percentage >= 80) {
          warningState = 'APPROACHING';
        }

        usageData = {
          current,
          limit,
          remaining,
          percentage,
          warningState,
        };
      }

      return {
        key,
        label: ENTITLEMENT_LABELS[key] || key,
        type,
        planDefault,
        override: overrideVal,
        effectiveValue,
        isOverridden,
        overrideReason: overrideItem?.reason,
        overrideUpdatedAt: overrideItem?.updatedAt,
        usage: usageData,
      };
    });
  }
}
