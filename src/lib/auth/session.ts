import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE } from './constants';
import { AdminSession, PermissionCode } from '@/types/auth';

const getSecretKey = () => {
  const secret = (process.env.AUTH_SECRET || '').trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Server configuration error: AUTH_SECRET environment variable is missing in production. Application cannot sign or verify secure session tokens.'
      );
    }
    return new TextEncoder().encode('fallback-secret-for-development-must-be-min-32-chars');
  }
  return new TextEncoder().encode(secret);
};

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      permissions: (payload.permissions || []) as PermissionCode[],
    };
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<AdminSession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(session: AdminSession): Promise<void> {
  const token = await createSessionToken(session);
  const cookieStore = cookies();

  // Enforce Secure cookies in production HTTPS deployments.
  // The canonical NEXT_PUBLIC_APP_URL is the primary protocol source.
  // In production, secure is strictly true unless explicitly configured for local development.
  // Client-controlled forwarded headers cannot downgrade production cookie security.
  const isProduction = process.env.NODE_ENV === 'production';
  const canonicalUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase();
  const isLocalHttpDev = !isProduction || canonicalUrl.startsWith('http://localhost') || canonicalUrl.startsWith('http://127.0.0.1');
  const secure = isProduction ? !isLocalHttpDev : false;

  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function removeSessionCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
