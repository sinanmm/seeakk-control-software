'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createCompanyAction } from '@/server/actions/company.actions';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlanDTO } from '@/types/entitlement';

interface CreateCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: PlanDTO[];
}

export function CreateCompanyModal({
  isOpen,
  onClose,
  plans,
}: CreateCompanyModalProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createCompanyAction(formData);

    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Failed to create company');
    } else {
      onClose();
      if (result.companyId) {
        router.push(`/companies/${result.companyId}`);
      } else {
        router.refresh();
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Customer Company"
      description="Register a new tenant company in the SEEAKK Control Software database."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            name="name"
            label="Company Name"
            placeholder="Acme Technologies Ltd"
            required
          />
          <Input
            name="internalCode"
            label="Internal Code"
            placeholder="CO-1001"
            required
            helperText="Internal primary identifier (e.g. CO-1001)"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            name="slug"
            label="Unique Slug"
            placeholder="acme-tech"
            required
            helperText="Lowercase URL identifier"
          />
          <Input
            name="contactEmail"
            type="email"
            label="Contact Email"
            placeholder="billing@acme.com"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            name="contactPhone"
            label="Phone (Optional)"
            placeholder="+91 98765 43210"
          />
          <Input
            name="workspaceId"
            label="SEEAKK Workspace ID"
            placeholder="ws_abc123"
            helperText="Optional remote customer workspace ID"
          />
          <Select name="environment" label="Environment" defaultValue="PRODUCTION">
            <option value="PRODUCTION">Production</option>
            <option value="STAGING">Staging</option>
            <option value="TEST">Test</option>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select name="planId" label="Assigned Plan" required>
            <option value="">Select a subscription plan...</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code}) — ₹{p.price.toLocaleString('en-IN')}/{p.billingInterval.toLowerCase()}
              </option>
            ))}
          </Select>

          <Select name="status" label="Initial Status" defaultValue="TRIAL">
            <option value="TRIAL">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="GRACE_PERIOD">Grace Period</option>
            <option value="PAST_DUE">Past Due</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1.5">
            Internal Administrative Notes
          </label>
          <textarea
            name="notes"
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Sales notes, contract reference, enterprise terms..."
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={loading}>
            Create Company Record
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
