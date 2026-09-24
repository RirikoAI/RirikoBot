import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { SecretVault } from '@ririko/core';

/** Lifetime of a pending login: the user must finish the Discord consent screen within it. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

const CONTEXT = 'oauth-state';

export interface PendingLogin {
  state: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
}

/**
 * Seals the pending login into the short-lived OAuth cookie. AES-256-GCM authenticates it, so
 * the cookie doubles as the signed `state` parameter binding the callback to this browser.
 */
export function sealPendingLogin(vault: SecretVault, login: PendingLogin): string {
  return vault.encrypt(JSON.stringify(login), CONTEXT);
}

/** Returns the pending login when the cookie is authentic, fresh and matches `state`. */
export function openPendingLogin(
  vault: SecretVault,
  sealed: string,
  state: string,
  now: Date,
): PendingLogin | null {
  let login: PendingLogin;
  try {
    login = JSON.parse(vault.decrypt(sealed, CONTEXT)) as PendingLogin;
  } catch {
    return null;
  }
  const age = now.getTime() - login.issuedAt;
  if (!(age >= 0 && age <= OAUTH_STATE_TTL_MS)) return null;

  const expected = Buffer.from(login.state);
  const actual = Buffer.from(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return login;
}
