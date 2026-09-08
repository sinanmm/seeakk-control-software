import { AdminSession, PermissionCode } from '@/types/auth';
import { SYSTEM_ROLES } from './constants';

export function hasPermission(
  session: AdminSession | null | undefined,
  permission: PermissionCode
): boolean {
  if (!session) return false;
  // Super admin always has all permissions
  if (session.role === SYSTEM_ROLES.SUPER_ADMIN) return true;
  return session.permissions.includes(permission);
}

export function hasAnyPermission(
  session: AdminSession | null | undefined,
  permissions: PermissionCode[]
): boolean {
  if (!session) return false;
  if (session.role === SYSTEM_ROLES.SUPER_ADMIN) return true;
  return permissions.some((perm) => session.permissions.includes(perm));
}

export function assertPermission(
  session: AdminSession | null | undefined,
  permission: PermissionCode
): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Forbidden: Missing required permission "${permission}"`);
  }
}
