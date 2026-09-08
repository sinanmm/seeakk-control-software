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
