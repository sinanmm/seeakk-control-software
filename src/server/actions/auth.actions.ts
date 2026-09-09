'use server';

import { redirect } from 'next/navigation';
import { prisma, safeDbQuery } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie, removeSessionCookie } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/schemas';
import { AuditService } from '@/server/services/audit.service';
import { AuditAction } from '@prisma/client';
import { PermissionCode } from '@/types/auth';

export interface ActionState {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function loginAction(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const rawEmail = formData.get('email') as string;
  const rawPassword = formData.get('password') as string;

  const validation = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });

  if (!validation.success) {
    return {
      success: false,
      error: 'Please provide valid login credentials.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validation.data;
  const isProduction = process.env.NODE_ENV === 'production';

  let admin = null;
  try {
    admin = await prisma.adminUser.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
  } catch (err) {
    if (isProduction) {
      console.error('[Security] Database query failed during administrator authentication in production:', err);
      return {
        success: false,
        error: 'Authentication service temporarily unavailable. Please verify database connectivity.',
      };
    }
  }

  // Development/offline superadmin fallback:
  // Strictly disabled in production. Only evaluated in development when DB has no matching user.
  if (!admin) {
    if (!isProduction && email === 'admin@control.seeakk.internal' && password === 'ControlAdmin2026!') {
      await setSessionCookie({
        id: 'admin_demo_superadmin',
        email: 'admin@control.seeakk.internal',
        name: 'Control Super Administrator',
        role: 'SUPER_ADMIN',
        permissions: [
          'companies:read',
          'companies:write',
          'companies:status',
          'plans:manage',
          'entitlements:override',
          'grace_period:manage',
          'billing:read',
          'billing:manage',
          'admins:manage',
          'audit:read',
          'payments:review',
          'sync:manage',
        ],
      });
      redirect('/dashboard');
    }

    return {
      success: false,
      error: 'Invalid administrator email or password.',
    };
  }

  if (!admin.isActive) {
    return {
      success: false,
      error: 'This administrator account has been disabled. Contact system supervisor.',
    };
  }

  const isMatch = await verifyPassword(password, admin.passwordHash);
  if (!isMatch) {
    return {
      success: false,
      error: 'Invalid administrator email or password.',
    };
  }

  const permissions: PermissionCode[] = admin.role.permissions.map(
    (rp) => rp.permission.code as PermissionCode
  );

  const session = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role.name,
    permissions,
  };

  await setSessionCookie(session);

  // Update last login
  await safeDbQuery(
    () =>
      prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      }),
    null
  );

  await AuditService.record({
    session,
    action: AuditAction.ADMIN_LOGIN,
    entityType: 'AdminUser',
    entityId: admin.id,
  });

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await removeSessionCookie();
  redirect('/login');
}
