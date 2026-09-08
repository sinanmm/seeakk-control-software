import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';

interface UsageMeterProps {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  warningThreshold?: number; // default 80%
  className?: string;
}

export function UsageMeter({
  label,
  current,
  limit,
  unit = '',
  warningThreshold = 80,
  className,
}: UsageMeterProps) {
  const percentage = limit > 0 ? (current / limit) * 100 : 0;
  const isExceeded = percentage >= 100;
  const isApproaching = percentage >= warningThreshold && !isExceeded;
  const remaining = Math.max(0, limit - current);

  let barColor = 'bg-indigo-500';
  let badgeColor = 'text-zinc-400 bg-zinc-800';

  if (isExceeded) {
    barColor = 'bg-rose-500';
    badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  } else if (isApproaching) {
    barColor = 'bg-amber-500';
    badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-zinc-200">
            {formatNumber(current)} / {formatNumber(limit)} {unit}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[11px] font-medium border font-mono',
              badgeColor
            )}
          >
            {formatPercent(percentage)}
          </span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300 rounded-full', barColor)}
          style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {isExceeded ? (
            <span className="text-rose-400 font-medium">Limit Exceeded</span>
          ) : isApproaching ? (
            <span className="text-amber-400 font-medium">Approaching Limit</span>
          ) : (
            'Within Quota'
          )}
        </span>
        <span>{formatNumber(remaining)} {unit} remaining</span>
      </div>
    </div>
  );
}
