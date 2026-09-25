import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { getWebServices } from '../services';
import { needsPasskeyCheck, stepUpState, type StepUpState } from './passkey-policy';
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

/** Sets the session cookie from a Server Action (route handlers use `setCookie`). */
export async function writeSessionCookie(token: string, session: ActiveSession): Promise<void> {
  const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  (await cookies()).set(SESSION_COOKIE, token, { ...BASE_COOKIE, maxAge });
}

/** How many passkeys the user has, read once per request. */
export const getPasskeyCount = cache(async (userId: string): Promise<number> => {
  const { passkeys } = await getWebServices();
  return passkeys.count(userId);
});

/**
 * A signed-in session that may still owe its passkey check. Only the passkey check itself (the
 * verify page and its actions) may use this; everything else uses `requireSession`.
 */
export async function requireSessionForPasskeyCheck(returnTo: string): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}

/**
 * A usable session: signed in with Discord and, for users who have a passkey, verified with it
 * (ADR-013 sign-in gate). Otherwise redirects to login or to the passkey check.
 */
export async function requireSession(returnTo: string): Promise<ActiveSession> {
  const session = await requireSessionForPasskeyCheck(returnTo);
  if (needsPasskeyCheck(session, await getPasskeyCount(session.userId))) {
    redirect(`/verify?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}

/**
 * Sensitive writes need a passkey check newer than five minutes. Returns `ok`, or the reason the
 * caller must report so the client can run a passkey check (or tell the user to add a passkey).
 */
export async function requireStepUp(session: ActiveSession): Promise<StepUpState> {
  return stepUpState(session, await getPasskeyCount(session.userId), Date.now());
}
