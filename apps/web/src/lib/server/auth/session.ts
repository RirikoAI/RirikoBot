import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { getWebServices } from '../services';
import type { ActiveSession } from './session-service';

/** `__Host-` pins the cookie to this origin: Secure, Path=/, no Domain attribute. */
export const SESSION_COOKIE = '__Host-ririko_session';
export const OAUTH_COOKIE = '__Host-ririko_oauth';

const BASE_COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  response.cookies.set(name, value, { ...BASE_COOKIE, maxAge: maxAgeSeconds });
}

/** Browsers ignore a `__Host-` Set-Cookie without Secure, so clear with the full attribute set. */
export function clearCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, '', { ...BASE_COOKIE, maxAge: 0 });
}

/** The current request's session, resolved once per request. */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sessions } = await getWebServices();
  return sessions.resolve(token);
});

export interface CurrentUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Profile of the signed-in user for page chrome (never includes tokens). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const { users } = await getWebServices();
  const user = await users.findById(session.userId);
  return {
    id: session.userId,
    name: user?.displayName ?? user?.username ?? 'Discord user',
    avatarUrl: user?.avatarUrl ?? null,
  };
});

/** Sends visitors without a live session through Discord login, then back to `returnTo`. */
export async function requireSession(returnTo: string): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}
