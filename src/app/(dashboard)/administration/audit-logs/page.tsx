import * as React from 'react';
import { AuditService, AuditLogWithAdmin } from '@/server/services/audit.service';
import { PageHeader } from '@/components/layout/page-header';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/formatters';
import { FileClock, ShieldAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage() {
  const logs: AuditLogWithAdmin[] = await AuditService.getRecentLogs(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrative Audit Trail"
        description="Immutable chronological record of administrative actions, company lifecycle mutations, limit overrides, and financial entries."
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<FileClock className="h-6 w-6" />}
              title="No audit events recorded yet"
              description="Actions taken by administrators (status changes, overrides, grace period updates) are automatically recorded here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Administrator</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Details / Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: AuditLogWithAdmin) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono text-zinc-400 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-zinc-200">
                      {log.admin?.name || log.adminEmail}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {log.adminEmail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-semibold text-indigo-400">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-zinc-300">
                    {log.entityType}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500 max-w-[120px] truncate">
                    {log.entityId}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400 max-w-sm truncate font-mono">
                    {log.newValue
                      ? JSON.stringify(log.newValue)
                      : log.metadata
                      ? JSON.stringify(log.metadata)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
