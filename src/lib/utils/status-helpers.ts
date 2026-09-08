import { CompanyStatus, Environment } from '@/types/company';
import { InvoiceStatus, PaymentStatus } from '@/types/billing';

export interface StatusBadgeConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export function getCompanyStatusConfig(status: CompanyStatus): StatusBadgeConfig {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
        dot: 'bg-emerald-400',
      };
    case 'TRIAL':
      return {
        label: 'Trial',
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
        dot: 'bg-blue-400',
      };
    case 'GRACE_PERIOD':
      return {
        label: 'Grace Period',
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
        dot: 'bg-amber-400',
      };
    case 'PAST_DUE':
      return {
        label: 'Past Due',
        bg: 'bg-orange-500/10',
        text: 'text-orange-400',
        border: 'border-orange-500/20',
        dot: 'bg-orange-400',
      };
    case 'SUSPENDED':
      return {
        label: 'Suspended',
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        border: 'border-rose-500/20',
        dot: 'bg-rose-400',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
    default:
      return {
        label: status,
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
  }
}

export function getEnvironmentConfig(env: Environment): StatusBadgeConfig {
  switch (env) {
    case 'PRODUCTION':
      return {
        label: 'Production',
        bg: 'bg-indigo-500/10',
        text: 'text-indigo-400',
        border: 'border-indigo-500/20',
        dot: 'bg-indigo-400',
      };
    case 'STAGING':
      return {
        label: 'Staging',
        bg: 'bg-sky-500/10',
        text: 'text-sky-400',
        border: 'border-sky-500/20',
        dot: 'bg-sky-400',
      };
    case 'TEST':
      return {
        label: 'Test',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
    default:
      return {
        label: env,
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
  }
}

export function getInvoiceStatusConfig(status: InvoiceStatus): StatusBadgeConfig {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paid',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
        dot: 'bg-emerald-400',
      };
    case 'OPEN':
      return {
        label: 'Open',
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
        dot: 'bg-blue-400',
      };
    case 'PARTIALLY_PAID':
      return {
        label: 'Partially Paid',
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
        dot: 'bg-amber-400',
      };
    case 'OVERDUE':
      return {
        label: 'Overdue',
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        border: 'border-rose-500/20',
        dot: 'bg-rose-400',
      };
    case 'DRAFT':
      return {
        label: 'Draft',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
    case 'VOID':
      return {
        label: 'Void',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
    default:
      return {
        label: status,
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
  }
}

export function getPaymentStatusConfig(status: PaymentStatus): StatusBadgeConfig {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Completed',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
        dot: 'bg-emerald-400',
      };
    case 'PENDING':
      return {
        label: 'Pending',
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
        dot: 'bg-amber-400',
      };
    case 'FAILED':
      return {
        label: 'Failed',
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        border: 'border-rose-500/20',
        dot: 'bg-rose-400',
      };
    case 'REFUNDED':
      return {
        label: 'Refunded',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
    default:
      return {
        label: status,
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        border: 'border-zinc-500/20',
        dot: 'bg-zinc-400',
      };
  }
}
