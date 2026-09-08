'use client';

import * as React from 'react';
import { PlanDTO } from '@/types/entitlement';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';
import { Check, Users, Database, Layers, ShieldCheck, Sparkles } from 'lucide-react';

export function PlansView({ plans }: { plans: PlanDTO[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isEnterprise = plan.code === 'ENTERPRISE';

          return (
            <Card
              key={plan.id}
              className={
                isEnterprise
                  ? 'border-indigo-500/40 bg-indigo-950/[0.08] relative'
                  : ''
              }
            >
              {isEnterprise && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Flagship Tier
                  </span>
                </div>
              )}
              <CardHeader>
                <div>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <Badge variant={plan.isActive ? 'success' : 'neutral'}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">{plan.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Price Display */}
                <div className="pt-2 border-t border-zinc-800">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold font-mono text-zinc-100">
                      {formatCurrency(plan.price, plan.currency)}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      /{plan.billingInterval.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1 font-mono">
                    Code: <span className="text-zinc-400 font-semibold">{plan.code}</span> •{' '}
                    <span className="text-emerald-400 font-semibold">
                      {plan.activeCompaniesCount}
                    </span>{' '}
                    companies assigned
                  </div>
                </div>

                {/* Database-driven Entitlements List */}
                <div className="space-y-2.5 pt-3 border-t border-zinc-800 text-xs">
                  <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Included Quotas & Features
                  </div>
                  <ul className="space-y-2">
                    {plan.entitlements.map((ent) => {
                      const isNumeric = ent.type === 'NUMERIC';
                      const valueDisplay = isNumeric
                        ? ent.key === 'STORAGE_GB'
                          ? `${ent.numericValue} GB Storage`
                          : `${formatNumber(ent.numericValue)} ${ent.key.toLowerCase().replace('_', ' ')}`
                        : ent.booleanValue
                        ? `${ent.key.toLowerCase().replace('_', ' ')} enabled`
                        : `${ent.key.toLowerCase().replace('_', ' ')} disabled`;

                      return (
                        <li key={ent.key} className="flex items-center gap-2 text-zinc-300">
                          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="capitalize">{valueDisplay}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
