'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { UsageMeter } from '@/components/ui/usage-meter';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { CompanyStatusBadge, EnvironmentBadge, InvoiceStatusBadge, PaymentStatusBadge } from '@/components/ui/status-badge';
import {
  updateCompanyStatusAction,
  setEntitlementOverrideAction,
  removeEntitlementOverrideAction,
  manageGracePeriodAction,
  revokeGracePeriodAction,
} from '@/server/actions/company.actions';
import { createInvoiceAction, recordPaymentAction } from '@/server/actions/billing.actions';
import { EffectiveEntitlement } from '@/types/entitlement';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatters';
import {
  ShieldAlert,
  Sliders,
  Clock,
  Receipt,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Building,
} from 'lucide-react';
import { CompanyStatus, Environment } from '@/types/company';

interface CompanyDetailTabsProps {
  company: {
    id: string;
    internalCode: string;
    name: string;
    slug: string;
    workspaceId: string | null;
    environment: Environment;
    status: CompanyStatus;
    contactEmail: string;
    contactPhone: string | null;
    billingAddress: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  subscription: {
    id: string;
    planId: string;
    planName: string;
    planCode: string;
    price: number;
    currency: string;
    billingInterval: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
  gracePeriod: {
    id: string;
    isActive: boolean;
    startDate: Date;
    endDate: Date;
    daysRemaining: number;
    reason: string;
    notes: string | null;
  } | null;
  effectiveEntitlements: EffectiveEntitlement[];
  invoices: any[];
  payments: any[];
}

export function CompanyDetailTabs({
  company,
  subscription,
  gracePeriod,
  effectiveEntitlements,
  invoices,
  payments,
}: CompanyDetailTabsProps) {
  const router = useRouter();

  // Modals state
  const [statusModalOpen, setStatusModalOpen] = React.useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = React.useState(false);
  const [selectedEntitlement, setSelectedEntitlement] = React.useState<EffectiveEntitlement | null>(null);
  const [graceModalOpen, setGraceModalOpen] = React.useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [selectedInvoice, setSelectedInvoice] = React.useState<any | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Status Form handler
  const handleStatusChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('companyId', company.id);

    const res = await updateCompanyStatusAction(formData);
    setLoading(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to update status');
    } else {
      setStatusModalOpen(false);
      router.refresh();
    }
  };

  // Override Form handler
  const handleOverrideSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('companyId', company.id);
    if (selectedEntitlement) {
      formData.set('key', selectedEntitlement.key);
      formData.set('type', selectedEntitlement.type);
    }

    const res = await setEntitlementOverrideAction(formData);
    setLoading(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to set override');
    } else {
      setOverrideModalOpen(false);
      router.refresh();
    }
  };

  // Remove Override handler
  const handleRemoveOverride = async (key: string) => {
    if (!confirm('Revert this override back to the plan default value?')) return;
    const formData = new FormData();
    formData.set('companyId', company.id);
    formData.set('key', key);
    formData.set('reason', 'Administrative reset to plan default');
    await removeEntitlementOverrideAction(formData);
    router.refresh();
  };

  // Grace Period Form handler
  const handleGracePeriodSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('companyId', company.id);

    const res = await manageGracePeriodAction(formData);
    setLoading(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to configure grace period');
    } else {
      setGraceModalOpen(false);
      router.refresh();
    }
  };

  // Revoke Grace Period handler
  const handleRevokeGracePeriod = async () => {
    const reason = prompt('Please specify the reason for revoking the grace period:');
    if (!reason) return;
    const formData = new FormData();
    formData.set('companyId', company.id);
    formData.set('reason', reason);
    await revokeGracePeriodAction(formData);
    router.refresh();
  };

  // Invoice Submit handler
  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('companyId', company.id);

    const res = await createInvoiceAction(formData);
    setLoading(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to generate invoice');
    } else {
      setInvoiceModalOpen(false);
      router.refresh();
    }
  };

  // Payment Submit handler
  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('companyId', company.id);
    if (selectedInvoice) {
      formData.set('invoiceId', selectedInvoice.id);
    }

    const res = await recordPaymentAction(formData);
    setLoading(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to record payment');
    } else {
      setPaymentModalOpen(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview">
        <TabList>
          <TabTrigger value="overview">Overview</TabTrigger>
          <TabTrigger value="usage">Resource Usage</TabTrigger>
          <TabTrigger value="limits">Limits & Overrides</TabTrigger>
          <TabTrigger value="grace">Grace Period</TabTrigger>
          <TabTrigger value="billing">Billing & Invoices</TabTrigger>
        </TabList>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: OVERVIEW */}
        {/* ------------------------------------------------------------- */}
        <TabContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Company Identity & Environment</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusModalOpen(true)}
                  >
                    Change Operational Status
                  </Button>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <dt className="text-zinc-500 font-medium">Internal Company Code</dt>
                      <dd className="font-mono text-zinc-200 mt-0.5 text-sm font-semibold">
                        {company.internalCode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">System Slug</dt>
                      <dd className="font-mono text-zinc-200 mt-0.5">{company.slug}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">SEEAKK Workspace ID</dt>
                      <dd className="font-mono text-zinc-300 mt-0.5">
                        {company.workspaceId || 'Not connected yet'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">Deployment Environment</dt>
                      <dd className="mt-0.5">
                        <EnvironmentBadge environment={company.environment} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">Contact Email</dt>
                      <dd className="text-zinc-200 mt-0.5">{company.contactEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">Contact Phone</dt>
                      <dd className="text-zinc-200 mt-0.5">{company.contactPhone || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">Onboarded At</dt>
                      <dd className="text-zinc-300 mt-0.5 font-mono">
                        {formatDate(company.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 font-medium">Last Record Update</dt>
                      <dd className="text-zinc-300 mt-0.5 font-mono">
                        {formatDate(company.updatedAt)}
                      </dd>
                    </div>
                  </dl>

                  {company.notes && (
                    <div className="mt-5 pt-4 border-t border-zinc-800">
                      <span className="text-xs font-medium text-zinc-400">
                        Internal Notes:
                      </span>
                      <p className="text-xs text-zinc-300 mt-1 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                        {company.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Resource Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Core Utilization Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {effectiveEntitlements
                    .filter((e) => e.type === 'NUMERIC' && e.usage)
                    .slice(0, 3)
                    .map((ent) => (
                      <UsageMeter
                        key={ent.key}
                        label={ent.label}
                        current={ent.usage!.current}
                        limit={ent.usage!.limit}
                        unit={ent.key === 'STORAGE_GB' ? 'GB' : ''}
                      />
                    ))}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar: Subscription & Grace Card */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Assigned Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {subscription ? (
                    <>
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">
                          {subscription.planName}
                        </div>
                        <div className="text-indigo-400 font-mono text-xs mt-0.5">
                          {formatCurrency(subscription.price, subscription.currency)} /{' '}
                          {subscription.billingInterval.toLowerCase()}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-zinc-800 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Subscription Status</span>
                          <span className="font-mono text-zinc-200 font-medium">
                            {subscription.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Period Start</span>
                          <span className="font-mono text-zinc-300">
                            {formatDate(subscription.currentPeriodStart)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Period End</span>
                          <span className="font-mono text-zinc-300">
                            {formatDate(subscription.currentPeriodEnd)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-zinc-500">No active subscription assigned.</p>
                  )}
                </CardContent>
              </Card>

              {/* Grace Period Status Widget */}
              <Card>
                <CardHeader>
                  <CardTitle>Grace Period Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {gracePeriod && gracePeriod.isActive ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                        <Clock className="h-4 w-4" />
                        {gracePeriod.daysRemaining} Days Remaining
                      </div>
                      <p className="text-zinc-300 text-xs">{gracePeriod.reason}</p>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        Valid until: {formatDate(gracePeriod.endDate)}
                      </div>
                      <div className="pt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setGraceModalOpen(true)}
                        >
                          Extend
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={handleRevokeGracePeriod}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-zinc-400">
                        This company is not currently in an active grace period.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setGraceModalOpen(true)}
                      >
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        Grant Grace Period
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabContent>

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: USAGE */}
        {/* ------------------------------------------------------------- */}
        <TabContent value="usage">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Resource Usage & Consumption</CardTitle>
                <CardDescription>
                  Real-time consumption metrics measured against effective limits.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {effectiveEntitlements
                  .filter((e) => e.type === 'NUMERIC' && e.usage)
                  .map((ent) => (
                    <div
                      key={ent.key}
                      className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">
                          {ent.label}
                        </span>
                        {ent.isOverridden && (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                            Custom Override
                          </span>
                        )}
                      </div>
                      <UsageMeter
                        label=""
                        current={ent.usage!.current}
                        limit={ent.usage!.limit}
                        unit={ent.key === 'STORAGE_GB' ? 'GB' : ''}
                      />
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono">
                        <div>
                          <span className="text-zinc-500 block">Consumed</span>
                          <span className="text-zinc-200 font-semibold">
                            {formatNumber(ent.usage!.current)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Quota Limit</span>
                          <span className="text-zinc-200 font-semibold">
                            {formatNumber(ent.usage!.limit)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Remaining</span>
                          <span className="text-zinc-200 font-semibold">
                            {formatNumber(ent.usage!.remaining)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabContent>

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: LIMITS & OVERRIDES */}
        {/* ------------------------------------------------------------- */}
        <TabContent value="limits">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Entitlement Hierarchy & Custom Overrides</CardTitle>
                <CardDescription>
                  Plan defaults are inherited automatically unless a company-specific override is applied.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entitlement / Resource</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Plan Default</TableHead>
                    <TableHead>Company Override</TableHead>
                    <TableHead>Effective Limit</TableHead>
                    <TableHead>Reason / Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveEntitlements.map((ent) => {
                    const isBool = ent.type === 'BOOLEAN';
                    const formatVal = (v: any) =>
                      isBool ? (v ? 'Enabled' : 'Disabled') : formatNumber(v);

                    return (
                      <TableRow key={ent.key}>
                        <TableCell>
                          <div className="font-medium text-zinc-100">{ent.label}</div>
                          <div className="text-[10px] font-mono text-zinc-500">
                            {ent.key}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {ent.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400">
                          {formatVal(ent.planDefault)}
                        </TableCell>
                        <TableCell>
                          {ent.isOverridden ? (
                            <span className="font-mono text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                              {formatVal(ent.override)}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            {formatVal(ent.effectiveValue)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 max-w-xs truncate">
                          {ent.overrideReason || 'Standard plan tier'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedEntitlement(ent);
                                setOverrideModalOpen(true);
                              }}
                            >
                              <Sliders className="h-3 w-3 mr-1" />
                              {ent.isOverridden ? 'Edit' : 'Override'}
                            </Button>
                            {ent.isOverridden && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveOverride(ent.key)}
                                title="Revert to Plan Default"
                              >
                                <RotateCcw className="h-3 w-3 text-rose-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabContent>

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: GRACE PERIOD */}
        {/* ------------------------------------------------------------- */}
        <TabContent value="grace">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Grace Period Operations</CardTitle>
                <CardDescription>
                  Temporarily grant access without interruption for pending renewals or dispute resolution.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setGraceModalOpen(true)}>
                <Clock className="h-4 w-4 mr-1.5" />
                Configure Grace Period
              </Button>
            </CardHeader>
            <CardContent>
              {gracePeriod && gracePeriod.isActive ? (
                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                      <AlertTriangle className="h-5 w-5" />
                      Active Grace Period: {gracePeriod.daysRemaining} Days Remaining
                    </div>
                    <Button variant="danger" size="sm" onClick={handleRevokeGracePeriod}>
                      Revoke Immediately
                    </Button>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono pt-2 border-t border-amber-500/20">
                    <div>
                      <dt className="text-zinc-400 font-sans">Start Date</dt>
                      <dd className="text-zinc-200 mt-0.5">{formatDate(gracePeriod.startDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 font-sans">Expiry Date</dt>
                      <dd className="text-zinc-200 mt-0.5">{formatDate(gracePeriod.endDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 font-sans">Operational Status</dt>
                      <dd className="text-amber-400 font-semibold mt-0.5">IN EFFECT</dd>
                    </div>
                  </dl>
                  <div>
                    <span className="text-xs font-medium text-zinc-400">
                      Documented Reason:
                    </span>
                    <p className="text-xs text-zinc-200 mt-1 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
                      {gracePeriod.reason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Clock className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-zinc-200">
                    No active grace period in effect
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1 mb-4">
                    If this customer is pending payment or in renewal grace, grant a controlled extension.
                  </p>
                  <Button size="sm" onClick={() => setGraceModalOpen(true)}>
                    Grant New Grace Period
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabContent>

        {/* ------------------------------------------------------------- */}
        {/* TAB 5: BILLING & INVOICES */}
        {/* ------------------------------------------------------------- */}
        <TabContent value="billing">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>
                    All issued invoices, outstanding balances, and payment terms.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setInvoiceModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Invoice
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    No invoices recorded for this company.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-medium text-zinc-100">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-400">
                            {formatDate(inv.invoiceDate)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-400">
                            {formatDate(inv.dueDate)}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">
                            {formatCurrency(inv.totalAmount, inv.currency)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-emerald-400">
                            {formatCurrency(inv.amountPaid, inv.currency)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-rose-400 font-semibold">
                            {formatCurrency(inv.amountDue, inv.currency)}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={inv.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {inv.amountDue > 0 && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setPaymentModalOpen(true);
                                }}
                              >
                                Record Payment
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Settled transactions and audit references.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {payments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    No payments recorded yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference #</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs font-mono text-zinc-300">
                            {formatDate(p.paymentDate)}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-emerald-400">
                            {formatCurrency(p.amount, p.currency)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-300">
                            {p.paymentMethod}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-400">
                            {p.referenceNumber || '—'}
                          </TableCell>
                          <TableCell>
                            <PaymentStatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-xs text-zinc-400">
                            {p.notes || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabContent>
      </Tabs>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: STATUS CHANGE */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Update Operational Company Status"
        description="Modify lifecycle status for this tenant company. An audit log entry will be created."
      >
        <form onSubmit={handleStatusChange} className="space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-400">
              {actionError}
            </div>
          )}
          <Select name="status" label="New Company Status" defaultValue={company.status}>
            <option value="ACTIVE">ACTIVE — Normal operational access</option>
            <option value="TRIAL">TRIAL — Trial period active</option>
            <option value="GRACE_PERIOD">GRACE_PERIOD — Temporary access extension</option>
            <option value="PAST_DUE">PAST_DUE — Unsettled invoices overdue</option>
            <option value="SUSPENDED">SUSPENDED — Locked, access blocked</option>
            <option value="CANCELLED">CANCELLED — Closed tenant account</option>
          </Select>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Reason for Status Change (Required for Audit Trail)
            </label>
            <textarea
              name="reason"
              required
              rows={3}
              placeholder="e.g. Account suspended due to non-payment after 3 notices..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Save Status Change
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: ENTITLEMENT OVERRIDE */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title={`Configure Override: ${selectedEntitlement?.label}`}
        description="Set a bespoke company limit overriding the plan's default value."
      >
        <form onSubmit={handleOverrideSave} className="space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-400">
              {actionError}
            </div>
          )}
          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs space-y-1">
            <div className="text-zinc-500">
              Plan Default Value:{' '}
              <span className="text-zinc-200 font-mono font-medium">
                {String(selectedEntitlement?.planDefault)}
              </span>
            </div>
            <div className="text-zinc-500">
              Current Effective Value:{' '}
              <span className="text-indigo-400 font-mono font-bold">
                {String(selectedEntitlement?.effectiveValue)}
              </span>
            </div>
          </div>

          {selectedEntitlement?.type === 'NUMERIC' ? (
            <Input
              name="numericValue"
              type="number"
              label="Custom Limit Value"
              defaultValue={
                typeof selectedEntitlement.override === 'number'
                  ? selectedEntitlement.override
                  : typeof selectedEntitlement.planDefault === 'number'
                  ? selectedEntitlement.planDefault
                  : 0
              }
              required
            />
          ) : (
            <Select
              name="booleanValue"
              label="Custom Toggle State"
              defaultValue={String(selectedEntitlement?.override ?? selectedEntitlement?.planDefault ?? false)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Select>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Reason for Custom Override (Required)
            </label>
            <textarea
              name="reason"
              required
              rows={2}
              placeholder="e.g. Approved extra 25 seats for annual contract upsell..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Apply Override
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: GRACE PERIOD */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={graceModalOpen}
        onClose={() => setGraceModalOpen(false)}
        title="Grant or Extend Grace Period"
        description="Authorize temporary operating time to resolve billing disputes or renewal processing."
      >
        <form onSubmit={handleGracePeriodSubmit} className="space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-400">
              {actionError}
            </div>
          )}
          <Input
            name="days"
            type="number"
            label="Duration in Days"
            defaultValue={7}
            min={1}
            max={90}
            required
            helperText="Number of full days to extend access starting from today."
          />
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Justification / Reason (Required)
            </label>
            <textarea
              name="reason"
              required
              rows={2}
              placeholder="e.g. Wire transfer in transit from international bank..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Internal Admin Notes (Optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Additional internal audit context..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setGraceModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Authorize Grace Period
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CREATE INVOICE */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        title="Issue Customer Invoice"
        description="Generate a billing invoice for this tenant company."
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-400">
              {actionError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="subtotal"
              type="number"
              label="Subtotal (₹)"
              placeholder="14999"
              required
            />
            <Input
              name="tax"
              type="number"
              label="Tax Amount (₹)"
              placeholder="2700"
              defaultValue={0}
            />
          </div>
          <Input
            name="dueDate"
            type="date"
            label="Payment Due Date"
            required
            defaultValue={new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]}
          />
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Invoice Memo / Terms
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Annual platform fee + 25 seat add-on..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setInvoiceModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Issue Invoice
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: RECORD PAYMENT */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={`Record Payment for ${selectedInvoice?.invoiceNumber}`}
        description="Record a received transaction against this invoice."
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {actionError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-400">
              {actionError}
            </div>
          )}
          <Input
            name="amount"
            type="number"
            label="Amount Paid (₹)"
            defaultValue={selectedInvoice?.amountDue || 0}
            required
          />
          <Select name="paymentMethod" label="Payment Method" defaultValue="BANK_TRANSFER">
            <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
            <option value="UPI">UPI</option>
            <option value="CREDIT_CARD">Credit Card</option>
            <option value="STRIPE">Stripe</option>
            <option value="MANUAL">Manual / Cash</option>
          </Select>
          <Input
            name="referenceNumber"
            label="Transaction / UTR Reference #"
            placeholder="UTR9876543210"
          />
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Payment Memo (Optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Verified in HDFC current account..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={loading}>
              Confirm Payment
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
