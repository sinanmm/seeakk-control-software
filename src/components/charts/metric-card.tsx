import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  variant?: 'default' | 'warning' | 'danger' | 'success';
  className?: string;
}

export function MetricCard({
  label,
  value,
  subValue,
  icon,
  trend,
  variant = 'default',
  className,
}: MetricCardProps) {
  const borderVariants = {
    default: 'border-zinc-800 hover:border-zinc-700',
    warning: 'border-amber-500/30 bg-amber-500/[0.03]',
    danger: 'border-rose-500/30 bg-rose-500/[0.03]',
    success: 'border-emerald-500/30 bg-emerald-500/[0.03]',
  };

  return (
    <div
      className={cn(
        'bg-zinc-900/90 border rounded-xl p-4 transition-all duration-150',
        borderVariants[variant],
        className
      )}
    >
      <div className="flex items-center justify-between text-zinc-400 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon && <div className="text-zinc-400">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-zinc-100 font-mono">
          {value}
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium font-mono',
              trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subValue && (
        <p className="text-xs text-zinc-400 mt-1 truncate">{subValue}</p>
      )}
    </div>
  );
}
