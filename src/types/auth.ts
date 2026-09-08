export type PermissionCode =
  | 'companies:read'
  | 'companies:write'
  | 'companies:status'
  | 'plans:manage'
  | 'entitlements:override'
  | 'grace_period:manage'
  | 'billing:read'
  | 'billing:manage'
  | 'admins:manage'
  | 'audit:read';

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: PermissionCode[];
}

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  roleId: string;
  role: {
    id: string;
    name: string;
    description: string | null;
  };
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}
