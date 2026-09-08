'use client';

import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction } from '@/server/actions/auth.actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock, AlertCircle, Info } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" isLoading={pending}>
      Sign In to Control Software
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, null);
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <div className="w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 items-center justify-center text-indigo-400 mb-2">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            SEEAKK Control Software
          </h1>
          <p className="text-xs text-zinc-400">
            Restricted Administrative Access • Internal Operations Only
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl space-y-5">
          {state?.error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <Input
              name="email"
              type="email"
              label="Administrator Email"
              placeholder="admin@control.seeakk.internal"
              required
              defaultValue={isDev ? 'admin@control.seeakk.internal' : undefined}
              error={state?.fieldErrors?.email?.[0]}
            />

            <Input
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••••••"
              required
              defaultValue={isDev ? 'ControlAdmin2026!' : undefined}
              error={state?.fieldErrors?.password?.[0]}
            />

            <SubmitButton />
          </form>

          {isDev && (
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-start gap-2 text-[11px] text-zinc-400">
                <Info className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-zinc-300">Initial Development Setup:</span>
                  <div className="font-mono text-zinc-400 mt-0.5">
                    Email: <span className="text-zinc-200">admin@control.seeakk.internal</span>
                  </div>
                  <div className="font-mono text-zinc-400">
                    Password: <span className="text-zinc-200">ControlAdmin2026!</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="text-center text-[11px] text-zinc-500 flex items-center justify-center gap-1.5">
          <Lock className="h-3 w-3" />
          <span>All administrative sessions and actions are logged and audited.</span>
        </div>
      </div>
    </div>
  );
}
