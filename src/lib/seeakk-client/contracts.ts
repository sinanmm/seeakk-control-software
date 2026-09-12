import { z } from 'zod';

// ---------------------------------------------------------------------------
// COMMON & SHARED SCHEMAS
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  page: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const SeeakkPlanBriefSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  pricePerUserMonth: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
});

export const SeeakkActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 1. DASHBOARD CONTRACTS (/api/internal/platform/dashboard)
// ---------------------------------------------------------------------------

export const SeeakkDashboardResponseSchema = z.object({
  success: z.boolean(),
  metrics: z.object({
    companies: z.object({
      total: z.number(),
      active: z.number(),
      expired: z.number(),
      paymentPending: z.number(),
      paymentRequired: z.number(),
      grace: z.number(),
      locked: z.number(),
      suspended: z.number(),
    }).optional(),
    revenue: z.record(z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 2. MODULES CATALOG (/api/internal/platform/modules)
// ---------------------------------------------------------------------------

export const SeeakkModuleItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isBeta: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const SeeakkModulesResponseSchema = z.object({
  success: z.boolean(),
  modules: z.array(SeeakkModuleItemSchema),
});

// ---------------------------------------------------------------------------
// 3. COMPANIES LIST (/api/internal/platform/companies)
// ---------------------------------------------------------------------------

export const SeeakkCompanyItemSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  billingStatus: z.string().optional().nullable(),
  activePlan: SeeakkPlanBriefSchema.nullable().optional(),
  approvedUserLimit: z.number().nullable().optional(),
  activeUserCount: z.number().optional(),
  availableSeats: z.number().optional(),
  isOverLimit: z.boolean().optional(),
  accessFrom: z.string().nullable().optional(),
  accessUntil: z.string().nullable().optional(),
  locked: z.boolean().optional(),
  suspended: z.boolean().optional(),
  activeGrace: z.boolean().optional(),
  graceUntil: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export const SeeakkCompanyListResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(SeeakkCompanyItemSchema),
  pagination: PaginationSchema,
});

// ---------------------------------------------------------------------------
// 4. COMPANY DETAILS (/api/internal/platform/companies/:id)
// ---------------------------------------------------------------------------

export const SeeakkCompanyDetailsResponseSchema = z.object({
  success: z.boolean(),
  company: z.object({
    id: z.string(),
    companyName: z.string(),
    createdAt: z.string().optional(),
  }),
  plan: SeeakkPlanBriefSchema.nullable().optional(),
  entitlement: z.object({
    billingStatus: z.string(),
    approvedUserLimit: z.number().nullable().optional(),
    activeUserCount: z.number().optional(),
    availableSeats: z.number().optional(),
    isOverLimit: z.boolean().optional(),
    accessFrom: z.string().nullable().optional(),
    accessUntil: z.string().nullable().optional(),
    effectiveStatus: z.string().optional(),
    entitlementSource: z.string().optional(),
  }).passthrough().optional(),
  modules: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      enabled: z.boolean(),
    })
  ).optional(),
  controls: z.object({
    locked: z.boolean().optional(),
    lockedAt: z.string().nullable().optional(),
    lockReason: z.string().nullable().optional(),
    suspended: z.boolean().optional(),
    suspendReason: z.string().nullable().optional(),
    activeGrace: z.boolean().optional(),
    graceUntil: z.string().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 5. COMPANY ENTITLEMENT (/api/internal/platform/companies/:id/entitlement)
// ---------------------------------------------------------------------------

export const SeeakkCompanyEntitlementResponseSchema = z.object({
  success: z.boolean(),
  effectiveStatus: z.string().optional(),
  entitlementSource: z.string().optional(),
  plan: SeeakkPlanBriefSchema.nullable().optional(),
  approvedUserLimit: z.number().nullable().optional(),
  activeUserCount: z.number().optional(),
  availableSeats: z.number().optional(),
  isOverLimit: z.boolean().optional(),
  accessFrom: z.string().nullable().optional(),
  accessUntil: z.string().nullable().optional(),
  enabledModules: z.array(z.string()).optional(),
  graceState: z.object({
    isActive: z.boolean(),
    graceUntil: z.string().nullable().optional(),
  }).optional(),
  lockState: z.object({
    isLocked: z.boolean(),
    lockedAt: z.string().nullable().optional(),
    lockReason: z.string().nullable().optional(),
  }).optional(),
  suspendState: z.object({
    isSuspended: z.boolean(),
    suspendReason: z.string().nullable().optional(),
  }).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 6. PAYMENT REQUESTS LIST & DETAILS (/api/internal/platform/payment-requests)
// ---------------------------------------------------------------------------

export const SeeakkPaymentSubmissionItemSchema = z.object({
  id: z.string(),
  proofStorageKey: z.string().optional(),
  transactionReference: z.string().nullable().optional(),
  utrNumber: z.string().nullable().optional(),
  paymentDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  proofAvailable: z.boolean().optional(),
  submittedAt: z.string().optional(),
  submittedBy: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }).optional(),
}).passthrough();

export const SeeakkPaymentRequestItemSchema = z.object({
  id: z.string().optional(),
  paymentRequestId: z.string().optional(),
  workspaceId: z.string(),
  status: z.string(),
  amount: z.number().optional(),
  calculatedAmount: z.number().optional(),
  unitPrice: z.number().optional(),
  currency: z.string().optional().default('INR'),
  billingCycle: z.string().optional().default('MONTHLY'),
  requestedUsers: z.number().optional(),
  requestedMonths: z.number().optional(),
  paymentReference: z.string().nullable().optional(),
  planCodeSnapshot: z.string().nullable().optional(),
  planNameSnapshot: z.string().nullable().optional(),
  companyName: z.string().optional(),
  company: z.object({
    id: z.string(),
    companyName: z.string(),
  }).optional(),
  requestedPlan: SeeakkPlanBriefSchema.nullable().optional(),
  currentPlan: SeeakkPlanBriefSchema.nullable().optional(),
  workspace: z.object({
    id: z.string(),
    companyName: z.string(),
    billingStatus: z.string().optional().nullable(),
  }).optional(),
  submission: SeeakkPaymentSubmissionItemSchema.nullable().optional(),
  paymentSubmissions: z.array(SeeakkPaymentSubmissionItemSchema).optional(),
  createdAt: z.string().optional(),
  submittedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
}).passthrough();

export const SeeakkPaymentRequestListResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(SeeakkPaymentRequestItemSchema),
  pagination: PaginationSchema,
});

export const SeeakkPaymentRequestDetailsResponseSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object' && !val.paymentRequest && (val.paymentRequestId || val.company || val.calculatedAmount !== undefined || val.amount !== undefined)) {
    return {
      success: val.success ?? true,
      paymentRequest: {
        id: val.paymentRequestId || val.id,
        paymentRequestId: val.paymentRequestId || val.id,
        workspaceId: val.company?.id || val.workspaceId || '',
        status: val.status || 'PENDING',
        amount: val.amount ?? val.calculatedAmount,
        calculatedAmount: val.calculatedAmount ?? val.amount,
        unitPrice: val.unitPrice,
        currency: val.currency || 'INR',
        requestedUsers: val.requestedUsers,
        requestedMonths: val.requestedMonths,
        paymentReference: val.paymentReference,
        planCodeSnapshot: val.planCodeSnapshot,
        planNameSnapshot: val.planNameSnapshot,
        company: val.company,
        companyName: val.company?.companyName,
        requestedPlan: val.requestedPlan,
        currentPlan: val.currentPlan,
        submission: val.submission,
        createdAt: val.createdAt,
      },
      seatUsage: val.currentEntitlement ? {
        activeUserCount: val.currentEntitlement.activeUserCount || 0,
        availableUserCount: val.currentEntitlement.availableSeats || 0,
      } : val.seatUsage,
      accessDecision: val.currentEntitlement ? {
        isAllowed: true,
        reason: val.currentEntitlement.effectiveStatus || '',
      } : val.accessDecision,
    };
  }
  return val;
}, z.object({
  success: z.boolean(),
  paymentRequest: SeeakkPaymentRequestItemSchema.passthrough(),
  seatUsage: z.object({
    activeUserCount: z.number(),
    availableUserCount: z.number(),
  }).optional(),
  accessDecision: z.object({
    isAllowed: z.boolean(),
    reason: z.string(),
  }).optional(),
}).passthrough());

// ---------------------------------------------------------------------------
// 7. PAYMENT PROOF RESPONSE (/api/internal/platform/payment-requests/:id/proof)
// ---------------------------------------------------------------------------

export const SeeakkPaymentProofResponseSchema = z.object({
  success: z.boolean(),
  proofStorageKey: z.string().optional(),
  storageKey: z.string().optional(),
  proofUrl: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 8. COMPANY USERS RESPONSE (/api/internal/platform/companies/:id/users)
// ---------------------------------------------------------------------------

export const SeeakkCompanyUserItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
}).passthrough();

export const SeeakkCompanyUsersResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(SeeakkCompanyUserItemSchema),
  pagination: PaginationSchema.optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// 9. REVENUE METRICS (/api/internal/platform/revenue)
// ---------------------------------------------------------------------------

export const SeeakkRevenueResponseSchema = z.object({
  success: z.boolean(),
  revenue: z.record(z.unknown()).optional(),
  metrics: z.record(z.unknown()).optional(),
}).passthrough();


// ---------------------------------------------------------------------------
// 8. REQUEST PAYLOAD SCHEMAS FOR OUTBOUND MUTATIONS
// ---------------------------------------------------------------------------

export const GrantGraceRequestSchema = z.object({
  allowedUserLimit: z.number().int().positive().optional(),
  graceFrom: z.string().optional(),
  graceUntil: z.string(),
  reason: z.string().min(3),
  grantedBy: z.string().optional(),
});

export const RevokeGraceRequestSchema = z.object({
  reason: z.string().min(3),
  revokedBy: z.string().optional(),
});

export const LockCompanyRequestSchema = z.object({
  reason: z.string().min(3),
  lockedBy: z.string().optional(),
});

export const UnlockCompanyRequestSchema = z.object({
  unlockedBy: z.string().optional(),
});

export const SuspendCompanyRequestSchema = z.object({
  reason: z.string().min(3),
  suspendedBy: z.string().optional(),
});

export const UnsuspendCompanyRequestSchema = z.object({
  unsuspendedBy: z.string().optional(),
});

export const ApprovePaymentRequestSchema = z.object({
  approvedUserLimit: z.number().int().positive().optional(),
  accessFrom: z.string().optional(),
  accessUntil: z.string().optional(),
  remarks: z.string().optional(),
  approvedBy: z.string().optional(),
});

export const RejectPaymentRequestSchema = z.object({
  reason: z.string().min(3),
  remarks: z.string().optional(),
  rejectedBy: z.string().optional(),
});

export const UpdateCompanyLimitRequestSchema = z.object({
  approvedUserLimit: z.number().int().min(0).nullable(),
  reason: z.string().optional(),
  updatedBy: z.string().optional(),
});

// ---------------------------------------------------------------------------
// TYPE INFERENCES
// ---------------------------------------------------------------------------

export type SeeakkDashboardResponse = z.infer<typeof SeeakkDashboardResponseSchema>;
export type SeeakkModulesResponse = z.infer<typeof SeeakkModulesResponseSchema>;
export type SeeakkCompanyItem = z.infer<typeof SeeakkCompanyItemSchema>;
export type SeeakkCompanyListResponse = z.infer<typeof SeeakkCompanyListResponseSchema>;
export type SeeakkCompanyDetailsResponse = z.infer<typeof SeeakkCompanyDetailsResponseSchema>;
export type SeeakkCompanyEntitlementResponse = z.infer<typeof SeeakkCompanyEntitlementResponseSchema>;
export type SeeakkPaymentRequestItem = z.infer<typeof SeeakkPaymentRequestItemSchema>;
export type SeeakkPaymentRequestListResponse = z.infer<typeof SeeakkPaymentRequestListResponseSchema>;
export type SeeakkPaymentRequestDetailsResponse = z.infer<typeof SeeakkPaymentRequestDetailsResponseSchema>;
export type SeeakkPaymentProofResponse = z.infer<typeof SeeakkPaymentProofResponseSchema>;
export type SeeakkActionResponse = z.infer<typeof SeeakkActionResponseSchema>;
export type SeeakkCompanyUsersResponse = z.infer<typeof SeeakkCompanyUsersResponseSchema>;
export type SeeakkRevenueResponse = z.infer<typeof SeeakkRevenueResponseSchema>;


export type GrantGraceRequest = z.infer<typeof GrantGraceRequestSchema>;
export type RevokeGraceRequest = z.infer<typeof RevokeGraceRequestSchema>;
export type LockCompanyRequest = z.infer<typeof LockCompanyRequestSchema>;
export type UnlockCompanyRequest = z.infer<typeof UnlockCompanyRequestSchema>;
export type SuspendCompanyRequest = z.infer<typeof SuspendCompanyRequestSchema>;
export type UnsuspendCompanyRequest = z.infer<typeof UnsuspendCompanyRequestSchema>;
export type ApprovePaymentRequest = z.infer<typeof ApprovePaymentRequestSchema>;
export type RejectPaymentRequest = z.infer<typeof RejectPaymentRequestSchema>;
export type UpdateCompanyLimitRequest = z.infer<typeof UpdateCompanyLimitRequestSchema>;

export type GrantGraceInput = GrantGraceRequest;
export type RevokeGraceInput = RevokeGraceRequest;
export type LockCompanyInput = LockCompanyRequest;
export type UnlockCompanyInput = UnlockCompanyRequest;
export type SuspendCompanyInput = SuspendCompanyRequest;
export type UnsuspendCompanyInput = UnsuspendCompanyRequest;
export type ApprovePaymentInput = ApprovePaymentRequest;
export type RejectPaymentInput = RejectPaymentRequest;
export type UpdateCompanyLimitInput = UpdateCompanyLimitRequest;

