'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { syncPaymentRequestsAction } from '@/server/actions/payment-review.actions';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface SyncPaymentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEnvironment?: 'TEST' | 'STAGING' | 'PRODUCTION';
}

export function SyncPaymentsModal({
  open,
  onOpenChange,
  defaultEnvironment = 'TEST',
}: SyncPaymentsModalProps) {
  const [environment, setEnvironment] = React.useState<'TEST' | 'STAGING' | 'PRODUCTION'>(
    defaultEnvironment
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any | null>(null);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set('environment', environment);

    try {
      const res = await syncPaymentRequestsAction(formData);
      if (!res.success) {
        setError(res.error || 'Failed to synchronize payment requests');
      } else {
        setResult(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during synchronization');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Sync Payment Requests"
      description="Fetch and synchronize offline payment proof submissions from the selected SEEAKK environment."
      maxWidth="md"
    >
      <form onSubmit={handleSync} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Target Environment
          </label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as any)}
            disabled={loading}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="TEST">TEST (Sandbox / Evaluation)</option>
            <option value="STAGING">STAGING (Pre-release)</option>
            <option value="PRODUCTION">PRODUCTION (Live Commercial)</option>
          </select>
          <p className="text-[11px] text-zinc-500">
            Preserves environment isolation and associates records with companies in the selected environment.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-lg flex items-start gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Synchronization Completed</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-zinc-400 text-[11px]">
                <span>Total remote: <strong className="text-zinc-200">{result.total}</strong></span>
                <span>New requests: <strong className="text-emerald-300">+{result.created}</strong></span>
                <span>Updated: <strong className="text-indigo-300">{result.updated}</strong></span>
                <span>Failed: <strong className={result.failed > 0 ? 'text-red-400' : 'text-zinc-400'}>{result.failed}</strong></span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
            className="text-zinc-400"
          >
            Close
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                Synchronizing...
              </>
            ) : (
              'Start Synchronization'
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
