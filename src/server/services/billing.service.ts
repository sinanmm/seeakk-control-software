import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { InvoiceDTO, PaymentDTO, InvoiceStatus, PaymentMethod } from '@/types/billing';
import { AdminSession } from '@/types/auth';
import { AuditService } from './audit.service';
import { AuditAction } from '@prisma/client';

export interface InvoiceListItemDTO extends InvoiceDTO {
  companyCode: string;
}

export class BillingService {
  static async getInvoices(limit: number = 50): Promise<InvoiceListItemDTO[]> {
    return safeDbQuery<InvoiceListItemDTO[]>(
      async () => {
        const invoices = await prisma.invoice.findMany({
          take: limit,
          orderBy: { invoiceDate: 'desc' },
          include: {
            company: { select: { id: true, name: true, internalCode: true } },
            payments: true,
          },
        });

        return invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          companyId: inv.companyId,
          companyName: inv.company.name,
          companyCode: inv.company.internalCode,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          subtotal: inv.subtotal,
          tax: inv.tax,
          totalAmount: inv.totalAmount,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          currency: inv.currency,
          status: inv.status as InvoiceStatus,
          notes: inv.notes,
          paymentsCount: inv.payments.length,
        }));
      },
      [] as InvoiceListItemDTO[]
    );
  }

  static async getPayments(limit: number = 50): Promise<PaymentDTO[]> {
    return safeDbQuery<PaymentDTO[]>(
      async () => {
        const payments = await prisma.payment.findMany({
          take: limit,
          orderBy: { paymentDate: 'desc' },
          include: {
            company: { select: { name: true, internalCode: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        });

        return payments.map((p) => ({
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoice.invoiceNumber,
          companyId: p.companyId,
          companyName: p.company.name,
          amount: p.amount,
          currency: p.currency,
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod as PaymentMethod,
          referenceNumber: p.referenceNumber,
          status: p.status,
          notes: p.notes,
        }));
      },
      [] as PaymentDTO[]
    );
  }

  static async createInvoice(
    params: {
      companyId: string;
      subtotal: number;
      tax: number;
      currency?: string;
      dueDate: Date;
      notes?: string | null;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const count = await prisma.invoice.count();
        const year = new Date().getFullYear();
        const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
        const totalAmount = params.subtotal + params.tax;

        const invoice = await prisma.invoice.create({
          data: {
            companyId: params.companyId,
            invoiceNumber,
            dueDate: params.dueDate,
            subtotal: params.subtotal,
            tax: params.tax,
            totalAmount,
            amountPaid: 0,
            amountDue: totalAmount,
            currency: params.currency || 'INR',
            status: 'OPEN',
            notes: params.notes,
          },
        });

        await AuditService.record({
          session,
          action: AuditAction.INVOICE_CREATED,
          entityType: 'Invoice',
          entityId: invoice.id,
          newValue: {
            invoiceNumber,
            totalAmount,
            companyId: params.companyId,
          },
        });

        return invoice;
      },
      null
    );
  }

  static async recordPayment(
    params: {
      invoiceId: string;
      companyId: string;
      amount: number;
      currency?: string;
      paymentMethod: PaymentMethod;
      referenceNumber?: string | null;
      notes?: string | null;
    },
    session: AdminSession
  ) {
    return safeDbQuery(
      async () => {
        const invoice = await prisma.invoice.findUnique({
          where: { id: params.invoiceId },
        });

        if (!invoice) throw new Error('Invoice not found');

        const payment = await prisma.payment.create({
          data: {
            invoiceId: params.invoiceId,
            companyId: params.companyId,
            amount: params.amount,
            currency: params.currency || invoice.currency,
            paymentMethod: params.paymentMethod,
            referenceNumber: params.referenceNumber,
            status: 'COMPLETED',
            notes: params.notes,
            recordedByAdminId: session.id,
          },
        });

        const newAmountPaid = invoice.amountPaid + params.amount;
        const newAmountDue = Math.max(0, invoice.totalAmount - newAmountPaid);
        const newStatus =
          newAmountDue === 0
            ? 'PAID'
            : newAmountPaid > 0
            ? 'PARTIALLY_PAID'
            : invoice.status;

        await prisma.invoice.update({
          where: { id: params.invoiceId },
          data: {
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            status: newStatus,
          },
        });

        await AuditService.record({
          session,
          action: AuditAction.PAYMENT_RECORDED,
          entityType: 'Payment',
          entityId: payment.id,
          newValue: {
            invoiceNumber: invoice.invoiceNumber,
            amount: params.amount,
            method: params.paymentMethod,
          },
        });

        return payment;
      },
      null
    );
  }
}
