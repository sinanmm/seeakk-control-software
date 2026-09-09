'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Layers,
  FileText,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { PaymentProofRequestDTO } from '@/types/billing';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { approvePaymentAction, rejectPaymentAction } from '@/server/actions/payment-review.actions';

interface PaymentReviewDrawerProps {
  payment: PaymentProofRequestDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete?: () => void;
}

export function PaymentReviewDrawer({
  payment,
  open,
  onOpenChange,
  onActionComplete,
}: PaymentReviewDrawerProps) {
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);

  // Form states
  const [approvedUserLimit, setApprovedUserLimit] = React.useState<number>(1);
  const [accessFrom, setAccessFrom] = React.useState<string>('');
  const [accessUntil, setAccessUntil] = React.useState<string>('');
  const [remarks, setRemarks] = React.useState<string>('');
  const [rejectionReason, setRejectionReason] = React.useState<string>('');

  const [loading, setLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // Initialize form default values when a payment is selected
  React.useEffect(() => {
    if (payment) {
      const users = payment.requestedUsers || 1;
      setApprovedUserLimit(users);

      const today = new Date();
      const fromStr = today.toISOString().split('T')[0];
      setAccessFrom(fromStr);

      const months = payment.requestedMonths || 1;
      const untilDate = new Date();
      untilDate.setMonth(untilDate.getMonth() + months);
      const untilStr = untilDate.toISOString().split('T')[0];
      setAccessUntil(untilStr);

      setRemarks('');
      setRejectionReason('');
      setActionError(null);
      setActionSuccess(null);
    }
  }, [payment]);

  if (!payment) return null;

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);

    const formData = new FormData();
    formData.set('paymentRequestId', payment.seeakkPaymentId);
    formData.set('approvedUserLimit', String(approvedUserLimit));
    formData.set('accessFrom', accessFrom);
    formData.set('accessUntil', accessUntil);
    formData.set('remarks', remarks);
    formData.set('environment', payment.environment);

    try {
      const res = await approvePaymentAction(formData);
      if (!res.success) {
        setActionError(res.error || 'Failed to approve payment');
      } else {
        setActionSuccess(res.message || 'Payment approved successfully.');
        setApproveOpen(false);
        if (onActionComplete) onActionComplete();
      }
    } catch (err: any) {
      setActionError(err.message || 'An unexpected error occurred during approval');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);

    const formData = new FormData();
    formData.set('paymentRequestId', payment.seeakkPaymentId);
    formData.set('reason', rejectionReason);
    formData.set('remarks', remarks);
    formData.set('environment', payment.environment);

    try {
      const res = await rejectPaymentAction(formData);
      if (!res.success) {
        setActionError(res.error || 'Failed to reject payment');
      } else {
        setActionSuccess(res.message || 'Payment rejected successfully.');
        setRejectOpen(false);
        if (onActionComplete) onActionComplete();
      }
    } catch (err: any) {
      setActionError(err.message || 'An unexpected error occurred during rejection');
    } finally {
      setLoading(false);
    }
  };

  const isPending = payment.status === 'PENDING' || payment.status === 'UNDER_REVIEW';

  return (
    <>
      <Dialog
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title="Payment Proof Review"
        description={`Reference: ${payment.paymentReference || payment.seeakkPaymentId} (${payment.environment})`}
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {actionSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-lg flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg flex items-center gap-2 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Grid 1: Financial & Submission Details */}
          <div className="grid grid-cols-2 gap-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
            <div>
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block mb-1">
                Amount Transferred
              </span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {formatCurrency(payment.amount, payment.currency)}
              </span>
              {payment.unitPrice && (
                <span className="text-[11px] text-zinc-500 block mt-0.5">
                  Unit: {formatCurrency(payment.unitPrice, payment.currency)} / user / mo
                </span>
              )}
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block mb-1">
                Bank Reference / UTR
              </span>
              <span className="text-sm font-mono font-semibold text-zinc-200 block">
                {payment.transactionRef || 'None Provided'}
              </span>
              <span className="text-[11px] text-zinc-500 block mt-0.5">
                Submitted: {payment.submittedAt ? formatDate(payment.submittedAt) : 'Pending'}
              </span>
            </div>
          </div>

          {/* Grid 2: Tenant & Requested Limits */}
          <div className="grid grid-cols-2 gap-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                <span>{payment.companyName}</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">
                Workspace: {payment.workspaceId}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                <span>Plan: {payment.planName}</span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-3">
                <span>Seats: <strong className="text-zinc-200">{payment.requestedUsers || '1'} users</strong></span>
                <span>Duration: <strong className="text-zinc-200">{payment.requestedMonths || '1'} mo</strong></span>
              </div>
            </div>
          </div>

          {/* Payment Proof Preview Box */}
          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-indigo-400" />
                Payment Proof Document
              </span>
              <a
                href={`/api/admin/payment-requests/${payment.seeakkPaymentId}/proof`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                Open in New Tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-2 flex items-center justify-center min-h-[200px] max-h-[320px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/payment-requests/${payment.seeakkPaymentId}/proof`}
                alt="Payment Proof Screenshot"
                className="max-h-[300px] max-w-full rounded object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  if (target.nextElementSibling) {
                    (target.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div className="hidden flex-col items-center justify-center py-6 text-zinc-500 space-y-1">
                <FileText className="h-8 w-8 text-zinc-600" />
                <p className="text-xs text-zinc-400">Proof preview not available inline</p>
                <p className="text-[11px] text-zinc-500">
                  Key: {payment.proofFileKey || 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Review History Card if already reviewed */}
          {!isPending && (
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-1.5">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
                Review Decision History
              </span>
              <div className="text-xs text-zinc-400">
                Reviewed at: <span className="text-zinc-200">{payment.reviewedAt ? formatDate(payment.reviewedAt) : 'Recorded'}</span>
              </div>
              {payment.rejectionReason && (
                <div className="text-xs text-red-400 bg-red-950/30 p-2 rounded border border-red-900/40">
                  <strong>Rejection Reason:</strong> {payment.rejectionReason}
                </div>
              )}
              {Boolean(payment.approvedEntitlements) && (
                <div className="text-xs text-emerald-400 bg-emerald-950/30 p-2 rounded border border-emerald-900/40">
                  <strong>Approved Entitlements:</strong> {JSON.stringify(payment.approvedEntitlements)}
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400"
            >
              Close
            </Button>

            {isPending && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRejectOpen(true)}
                  className="border-red-900/60 text-red-400 hover:bg-red-950/40"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject Payment
                </Button>
                <Button
                  type="button"
                  onClick={() => setApproveOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Approve & Activate
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>

      {/* APPROVE CONFIRMATION MODAL */}
      <Dialog
        isOpen={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Confirm Payment Approval"
        description="Confirming will activate workspace access and assign the approved user quota on SEEAKK."
        maxWidth="md"
      >
        <form onSubmit={handleApprove} className="space-y-3.5 py-1 text-xs">
          <div>
            <label className="text-zinc-400 block mb-1">
              Requested User Limit (from submission)
            </label>
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded font-mono text-zinc-300">
              {payment.requestedUsers || 1} users
            </div>
          </div>

          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Approved User Limit (Seats) *
            </label>
            <input
              type="number"
              min={1}
              value={approvedUserLimit}
              onChange={(e) => setApprovedUserLimit(parseInt(e.target.value) || 1)}
              required
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Authoritative user seat cap that will be provisioned on SEEAKK.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-zinc-300 font-semibold block mb-1">
                Access From *
              </label>
              <input
                type="date"
                value={accessFrom}
                onChange={(e) => setAccessFrom(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-zinc-300 font-semibold block mb-1">
                Access Until *
              </label>
              <input
                type="date"
                value={accessUntil}
                onChange={(e) => setAccessUntil(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Approval Remarks (Optional)</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Bank transfer verified against Axis Bank statement."
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setApproveOpen(false)}
              disabled={loading}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              {loading ? 'Approving on SEEAKK...' : 'Confirm Approval & Activate'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* REJECT CONFIRMATION MODAL */}
      <Dialog
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject Payment Proof"
        description="This will mark the payment proof as rejected on SEEAKK. Workspace access will not be extended."
        maxWidth="md"
      >
        <form onSubmit={handleReject} className="space-y-3.5 py-1 text-xs">
          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Rejection Reason (Required, min 3 chars) *
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. UTR reference not found in company account ledger / Screenshot illegible."
              required
              minLength={3}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Internal Remarks (Optional)</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Notes for Control Software audit log"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejectOpen(false)}
              disabled={loading}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || rejectionReason.trim().length < 3}
              className="bg-red-600 hover:bg-red-500 text-white font-medium"
            >
              {loading ? 'Rejecting on SEEAKK...' : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
