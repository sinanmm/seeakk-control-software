export type InvoiceStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'OVERDUE'
  | 'VOID'
  | 'UNCOLLECTIBLE';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'UPI'
  | 'STRIPE'
  | 'MANUAL';

export interface InvoiceDTO {
  id: string;
  invoiceNumber: string;
  companyId: string;
  companyName: string;
  invoiceDate: Date;
  dueDate: Date;
  subtotal: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: InvoiceStatus;
  notes?: string | null;
  paymentsCount: number;
}

export interface PaymentDTO {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  companyId: string;
  companyName: string;
  amount: number;
  currency: string;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  status: PaymentStatus;
  notes: string | null;
  recordedByAdminEmail?: string | null;
}

export type PaymentRequestStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface PaymentProofRequestDTO {
  id: string;
  companyId: string;
  companyName: string;
  workspaceId: string;
  environment: 'TEST' | 'STAGING' | 'PRODUCTION';
  seeakkPaymentId: string;
  paymentReference: string | null;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  transactionRef: string | null;
  proofFileKey: string | null;
  proofFileMime: string | null;
  requestedUsers: number | null;
  requestedMonths: number | null;
  unitPrice: number | null;
  remoteStatus: string | null;
  paymentDate: Date | null;
  submittedAt: Date | null;
  notes: string | null;
  status: PaymentRequestStatus;
  reviewedByAdminId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  approvedEntitlements?: unknown;
  invoiceId: string | null;
  rawPayload?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

