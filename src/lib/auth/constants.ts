export const AUTH_COOKIE_NAME = 'seeakk_control_session';
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BILLING_ADMIN: 'BILLING_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
  VIEWER: 'VIEWER',
} as const;

export const DEFAULT_SUPERADMIN_EMAIL = 'admin@control.seeakk.internal';
