'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { assertPermission } from '@/lib/auth/permissions';
import { BillingService } from '@/server/services/billing.service';
import { createInvoiceSchema, recordPaymentSchema } from '@/lib/validation/schemas';
import { PaymentMethod } from '@/types/billing';

export async function createInvoiceAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'billing:manage');

  const rawData = {
    companyId: formData.get('companyId') as string,
    subtotal: Number(formData.get('subtotal')),
    tax: Number(formData.get('tax') || 0),
    currency: (formData.get('currency') as string) || 'INR',
    dueDate: formData.get('dueDate') as string,
    notes: (formData.get('notes') as string) || null,
  };

  const validated = createInvoiceSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Check amount and dates.' };
  }

  const result = await BillingService.createInvoice(
    {
      companyId: validated.data.companyId,
      subtotal: validated.data.subtotal,
      tax: validated.data.tax,
      currency: validated.data.currency,
      dueDate: new Date(validated.data.dueDate),
      notes: validated.data.notes,
    },
    session!
  );

  if (!result) {
    return { success: false, error: 'Failed to generate invoice.' };
  }

  revalidatePath('/billing');
  revalidatePath('/billing/invoices');
  revalidatePath(`/companies/${validated.data.companyId}`);
  return { success: true, invoiceId: result.id };
}

export async function recordPaymentAction(formData: FormData) {
  const session = await getCurrentSession();
  assertPermission(session, 'billing:manage');

  const rawData = {
    invoiceId: formData.get('invoiceId') as string,
    companyId: formData.get('companyId') as string,
    amount: Number(formData.get('amount')),
    currency: (formData.get('currency') as string) || 'INR',
    paymentMethod: formData.get('paymentMethod') as PaymentMethod,
    referenceNumber: (formData.get('referenceNumber') as string) || null,
    notes: (formData.get('notes') as string) || null,
  };

  const validated = recordPaymentSchema.safeParse(rawData);
  if (!validated.success) {
    return { success: false, error: 'Validation failed. Check payment amount.' };
  }

  const result = await BillingService.recordPayment(validated.data, session!);
  if (!result) {
    return { success: false, error: 'Failed to record payment.' };
  }

  revalidatePath('/billing');
  revalidatePath('/billing/invoices');
  revalidatePath(`/companies/${validated.data.companyId}`);
  return { success: true };
}
