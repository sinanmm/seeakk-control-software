import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const companyStatusEnum = z.enum([
  'TRIAL',
  'ACTIVE',
  'GRACE_PERIOD',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
]);

export const environmentEnum = z.enum(['PRODUCTION', 'STAGING', 'TEST']);

export const createCompanySchema = z.object({
  name: z.string().min(2, 'Company name is required'),
  internalCode: z
    .string()
    .min(2, 'Internal Code is required (e.g. CO-1001)')
    .regex(/^[A-Z0-9_-]+$/i, 'Alphanumeric and hyphens only'),
  slug: z
    .string()
    .min(2, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only'),
  contactEmail: z.string().email('Valid contact email is required'),
  contactPhone: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  environment: environmentEnum.default('PRODUCTION'),
  status: companyStatusEnum.default('TRIAL'),
  planId: z.string().min(1, 'Please select an initial plan'),
  notes: z.string().optional().nullable(),
});

export const updateCompanyStatusSchema = z.object({
  companyId: z.string().min(1),
  status: companyStatusEnum,
  reason: z.string().min(3, 'A reason for status change is required for audit logs'),
});

export const setEntitlementOverrideSchema = z.object({
  companyId: z.string().min(1),
  key: z.enum([
    'USERS',
    'LEADS',
    'LEAD_IMPORTS',
    'STORAGE_GB',
    'CUSTOM_DOMAINS',
    'API_ACCESS',
    'WEBHOOKS',
    'DEDICATED_SUPPORT',
  ]),
  type: z.enum(['NUMERIC', 'BOOLEAN']),
  numericValue: z.number().int().nonnegative().optional().nullable(),
  booleanValue: z.boolean().optional().nullable(),
  reason: z.string().min(3, 'Reason for entitlement override is required for audit trail'),
});

export const removeEntitlementOverrideSchema = z.object({
  companyId: z.string().min(1),
  key: z.string().min(1),
  reason: z.string().min(3, 'Reason for reverting override is required'),
});

export const manageGracePeriodSchema = z.object({
  companyId: z.string().min(1),
  days: z.number().int().min(1, 'Grace period must be at least 1 day').max(90, 'Maximum 90 days'),
  reason: z.string().min(3, 'Specific operational reason required for grace period grant'),
  notes: z.string().optional().nullable(),
});

export const grantGracePeriodSchema = z.object({
  companyId: z.string().min(1),
  allowedUserLimit: z.number().int().positive().optional(),
  graceUntil: z.string().optional(),
  days: z.number().int().min(1).max(90).optional(),
  reason: z.string().min(3, 'Reason is required (min 3 characters)'),
});

export const revokeGracePeriodSchema = z.object({
  companyId: z.string().min(1),
  reason: z.string().min(3, 'Reason for revoking grace period is required'),
});

export const lockCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: z.string().min(3, 'Reason for locking company is required (min 3 characters)'),
});

export const unlockCompanySchema = z.object({
  companyId: z.string().min(1),
});

export const suspendCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: z.string().min(3, 'Reason for suspending company is required (min 3 characters)'),
});

export const unsuspendCompanySchema = z.object({
  companyId: z.string().min(1),
});

export const syncCompaniesSchema = z.object({
  environment: z.enum(['TEST', 'STAGING', 'PRODUCTION']),
});


export const createInvoiceSchema = z.object({
  companyId: z.string().min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  currency: z.string().default('INR'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional().nullable(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  companyId: z.string().min(1),
  amount: z.number().positive('Payment amount must be greater than 0'),
  currency: z.string().default('INR'),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CREDIT_CARD', 'UPI', 'STRIPE', 'MANUAL']),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updatePlanSchema = z.object({
  planId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative(),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// PHASE 3B: PAYMENT REVIEW & APPROVAL SCHEMAS
// ---------------------------------------------------------------------------

export const syncPaymentRequestsSchema = z.object({
  environment: z.enum(['TEST', 'STAGING', 'PRODUCTION']).default('TEST'),
});

export const approvePaymentSchema = z.object({
  paymentRequestId: z.string().min(1, 'Payment Request ID is required'),
  approvedUserLimit: z.coerce.number().int().positive('Approved user limit must be at least 1'),
  accessFrom: z.string().min(1, 'Access start date is required'),
  accessUntil: z.string().min(1, 'Access end date is required'),
  remarks: z.string().optional().nullable(),
  environment: z.enum(['TEST', 'STAGING', 'PRODUCTION']).default('TEST'),
}).refine((data) => {
  const from = new Date(data.accessFrom).getTime();
  const until = new Date(data.accessUntil).getTime();
  return !isNaN(from) && !isNaN(until) && until > from;
}, {
  message: 'Access until date must be strictly after access start date',
  path: ['accessUntil'],
});

export const rejectPaymentSchema = z.object({
  paymentRequestId: z.string().min(1, 'Payment Request ID is required'),
  reason: z.string().min(3, 'Rejection reason must be at least 3 characters'),
  remarks: z.string().optional().nullable(),
  environment: z.enum(['TEST', 'STAGING', 'PRODUCTION']).default('TEST'),
});

