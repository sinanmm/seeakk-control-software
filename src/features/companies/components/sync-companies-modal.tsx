'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { syncCompaniesAction } from '@/server/actions/company.actions';
import { Environment } from '@/types/company';
import { CompanySyncSummary } from '@/server/services/company-sync.service';
import { RefreshCw, CheckCircle2, AlertTriangle, Building2, Database } from 'lucide-react';

interface SyncCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEnvironment?: Environment;
}

export function SyncCompaniesModal({
  isOpen,
  onClose,
  defaultEnvironment = 'TEST',
}: SyncCompaniesModalProps) {
  const [selectedEnv, setSelectedEnv] = React.useState<Environment>(defaultEnvironment);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<CompanySyncSummary | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setSummary(null);
      setSelectedEnv(defaultEnvironment);
    }
  }, [isOpen, defaultEnvironment]);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    setSummary(null);

    try {
      const result = await syncCompaniesAction(selectedEnv);
      if (result.success && result.summary) {
        setSummary(result.summary);
      } else {
        setError(result.error || 'Failed to synchronize companies with SEEAKK platform.');
      }
    } catch (err: any) {
      setError(err?.message || 'A network error occurred while initiating synchronization.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isPending) onClose();
      }}
      title="Synchronize Companies from SEEAKK"
      description="Pulls remote company workspaces, user counts, and grace states from the selected SEEAKK platform environment."
    >
      <div className="space-y-4 pt-2">
        {error && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {summary ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>Synchronization Completed Successfully</span>
              </div>
              <p className="text-xs text-zinc-300">
                Processed remote workspaces for environment <strong className="text-white font-mono">{summary.environment}</strong>.
              </p>

              <div className="grid grid-cols-4 gap-2 pt-2">
                <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</div>
                  <div className="text-lg font-mono font-semibold text-white">{summary.total}</div>
                </div>
                <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-center">
                  <div className="text-[10px] text-emerald-500 uppercase tracking-wider">Created</div>
                  <div className="text-lg font-mono font-semibold text-emerald-400">{summary.created}</div>
                </div>
                <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-center">
                  <div className="text-[10px] text-indigo-500 uppercase tracking-wider">Updated</div>
                  <div className="text-lg font-mono font-semibold text-indigo-400">{summary.updated}</div>
                </div>
                <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Unchanged</div>
                  <div className="text-lg font-mono font-semibold text-zinc-300">{summary.unchanged}</div>
                </div>
              </div>

              {summary.failed > 0 && (
                <div className="text-xs text-amber-400 mt-2">
                  Notice: {summary.failed} record(s) failed during synchronization. Check server logs for details.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={onClose} size="sm">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSync} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Target SEEAKK Environment
              </label>
              <Select
                value={selectedEnv}
                onChange={(e) => setSelectedEnv(e.target.value as Environment)}
                disabled={isPending}
                className="h-10 text-sm"
              >
                <option value="TEST">TEST (Recommended — Safe Test Environment)</option>
                <option value="STAGING">STAGING (Pre-production Staging)</option>
                <option value="PRODUCTION">PRODUCTION (Live Production Platform)</option>
              </Select>
              <p className="text-[11px] text-zinc-500">
                Workspaces are strictly isolated by environment. Remote companies will be synced into Control Software without overwriting commercial plans or administrative overrides.
              </p>
            </div>

            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 text-xs text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Database className="h-3.5 w-3.5 text-indigo-400" />
                <span>Sync Policy:</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-zinc-400">
                <li>Fetches all paginated workspaces via authenticated server-to-server HTTPS.</li>
                <li>Uses <code className="text-zinc-300">workspaceId + environment</code> as unique identity.</li>
                <li>Preserves Control-owned plans, manual overrides, and billing history.</li>
                <li>Never deletes Control records if missing from remote response.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending} className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
                {isPending ? 'Synchronizing Workspaces...' : `Sync ${selectedEnv} Workspaces`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
