'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { PaymentProofRequestDTO } from '@/types/billing';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { PaymentReviewDrawer } from './payment-review-drawer';
import { SyncPaymentsModal } from './sync-payments-modal';
import {
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  CreditCard,
  Building2,
} from 'lucide-react';
import Link from 'next/link';

interface PaymentRequestsTableProps {
  payments: PaymentProofRequestDTO[];
}

export function PaymentRequestsTable({ payments }: PaymentRequestsTableProps) {
  const [activeTab, setActiveTab] = React.useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [environmentFilter, setEnvironmentFilter] = React.useState<'ALL' | 'TEST' | 'STAGING' | 'PRODUCTION'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedPayment, setSelectedPayment] = React.useState<PaymentProofRequestDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [syncModalOpen, setSyncModalOpen] = React.useState(false);

  // Filter payments
  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      // Tab filter
      if (activeTab === 'PENDING') {
        if (p.status !== 'PENDING' && p.status !== 'UNDER_REVIEW') return false;
      } else if (activeTab === 'APPROVED') {
        if (p.status !== 'APPROVED') return false;
      } else if (activeTab === 'REJECTED') {
        if (p.status !== 'REJECTED') return false;
      }

      // Environment filter
      if (environmentFilter !== 'ALL' && p.environment !== environmentFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCompany = p.companyName.toLowerCase().includes(query);
        const matchWorkspace = p.workspaceId.toLowerCase().includes(query);
        const matchRef = (p.paymentReference || '').toLowerCase().includes(query);
        const matchUtr = (p.transactionRef || '').toLowerCase().includes(query);
        const matchSeeakkId = p.seeakkPaymentId.toLowerCase().includes(query);
        if (!matchCompany && !matchWorkspace && !matchRef && !matchUtr && !matchSeeakkId) {
          return false;
        }
      }

      return true;
    });
  }, [payments, activeTab, environmentFilter, searchQuery]);

  // Counts for tabs
  const pendingCount = React.useMemo(
    () => payments.filter((p) => p.status === 'PENDING' || p.status === 'UNDER_REVIEW').length,
    [payments]
  );
  const approvedCount = React.useMemo(
    () => payments.filter((p) => p.status === 'APPROVED').length,
    [payments]
  );
  const rejectedCount = React.useMemo(
    () => payments.filter((p) => p.status === 'REJECTED').length,
    [payments]
  );

  const handleReview = (payment: PaymentProofRequestDTO) => {
    setSelectedPayment(payment);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'PENDING'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            Pending
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('APPROVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'APPROVED'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Approved
            <span className="ml-1 text-[11px] text-zinc-500">({approvedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REJECTED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'REJECTED'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <XCircle className="h-3.5 w-3.5 text-red-400" />
            Rejected
            <span className="ml-1 text-[11px] text-zinc-500">({rejectedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'ALL'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({payments.length})
          </button>
        </div>

        {/* Right side: Search, Environment filter & Sync Action */}
        <div className="flex items-center gap-2">
          {/* Environment Filter */}
          <div className="relative">
            <select
              value={environmentFilter}
              onChange={(e) => setEnvironmentFilter(e.target.value as any)}
              aria-label="Filter payment requests by environment"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Environments</option>
              <option value="TEST">TEST</option>
              <option value="STAGING">STAGING</option>
              <option value="PRODUCTION">PRODUCTION</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search company, UTR, ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Sync Button */}
          <Button
            size="sm"
            onClick={() => setSyncModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Sync SEEAKK
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CreditCard className="h-8 w-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-zinc-300">No payment requests found</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {payments.length === 0
                ? 'No payment requests have been synchronized yet. Click "Sync SEEAKK" to import customer payment proofs.'
                : 'No payment submissions matched your selected status or filter criteria.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-xs">Company / Workspace</TableHead>
                <TableHead className="text-xs">Env</TableHead>
                <TableHead className="text-xs">Plan</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Requested Seats</TableHead>
                <TableHead className="text-xs">Reference / UTR</TableHead>
                <TableHead className="text-xs">Submitted Date</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => {
                const isItemPending =
                  payment.status === 'PENDING' || payment.status === 'UNDER_REVIEW';

                return (
                  <TableRow
                    key={payment.id}
                    className="border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                    onClick={() => handleReview(payment)}
                  >
                    <TableCell>
                      <div className="space-y-0.5">
                        <Link
                          href={`/companies/${payment.companyId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-semibold text-zinc-200 hover:text-indigo-400 flex items-center gap-1"
                        >
                          <Building2 className="h-3 w-3 text-zinc-500" />
                          {payment.companyName}
                        </Link>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {payment.workspaceId}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                          payment.environment === 'PRODUCTION'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : payment.environment === 'STAGING'
                            ? 'bg-sky-950 text-sky-300 border border-sky-800'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}
                      >
                        {payment.environment}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs font-medium text-zinc-300">
                        {payment.planName}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono text-xs font-semibold text-emerald-400">
                      {formatCurrency(payment.amount, payment.currency)}
                    </TableCell>

                    <TableCell className="text-xs text-zinc-300">
                      <span>{payment.requestedUsers || 1} users</span>
                      <span className="text-zinc-500 ml-1">
                        ({payment.requestedMonths || 1} mo)
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-mono text-xs text-zinc-200">
                          {payment.transactionRef || '—'}
                        </div>
                        {payment.paymentReference && (
                          <div className="font-mono text-[10px] text-zinc-500">
                            {payment.paymentReference}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs font-mono text-zinc-400">
                      {payment.submittedAt
                        ? formatDate(payment.submittedAt)
                        : payment.createdAt
                        ? formatDate(payment.createdAt)
                        : '—'}
                    </TableCell>

                    <TableCell>
                      {payment.status === 'APPROVED' && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      )}
                      {payment.status === 'REJECTED' && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-950/80 text-red-300 border border-red-800 flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      )}
                      {isItemPending && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1 w-fit">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant={isItemPending ? 'primary' : 'secondary'}
                        onClick={() => handleReview(payment)}
                        className={`text-xs h-7 px-2.5 ${
                          isItemPending
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'text-zinc-300'
                        }`}
                      >
                        {isItemPending ? 'Review' : 'View Details'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Review Drawer Modal */}
      <PaymentReviewDrawer
        payment={selectedPayment}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onActionComplete={() => {
          // Re-trigger server refresh if needed
          window.location.reload();
        }}
      />

      {/* Sync Payments Modal */}
      <SyncPaymentsModal
        open={syncModalOpen}
        onOpenChange={setSyncModalOpen}
      />
    </div>
  );
}
