import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { SecretVault } from '@ririko/core';

/** Lifetime of a pending login: the user must finish the Discord consent screen within it. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

const CONTEXT = 'oauth-state';
const INVITE_CONTEXT = 'oauth-invite';

export interface PendingLogin {
  state: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
}

/** A bot invite in progress (TASK-1841): the server chosen on the Servers page, if any. */
export interface PendingInvite {
  state: string;
  codeVerifier: string;
  guildId: string | null;
  issuedAt: number;
}

function seal(vault: SecretVault, context: string, pending: object): string {
  return vault.encrypt(JSON.stringify(pending), context);
}

function open<T extends { state: string; issuedAt: number }>(
  vault: SecretVault,
  context: string,
  sealed: string,
  state: string,
  now: Date,
): T | null {
  let pending: T;
  try {
    pending = JSON.parse(vault.decrypt(sealed, context)) as T;
  } catch {
    return null;
  }
  const age = now.getTime() - pending.issuedAt;
  if (!(age >= 0 && age <= OAUTH_STATE_TTL_MS)) return null;

  const expected = Buffer.from(pending.state);
  const actual = Buffer.from(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return pending;
}

/**
 * Seals the pending login into the short-lived OAuth cookie. AES-256-GCM authenticates it, so
 * the cookie doubles as the signed `state` parameter binding the callback to this browser.
 */
export function sealPendingLogin(vault: SecretVault, login: PendingLogin): string {
  return seal(vault, CONTEXT, login);
}

/** Returns the pending login when the cookie is authentic, fresh and matches `state`. */
export function openPendingLogin(
  vault: SecretVault,
  sealed: string,
  state: string,
  now: Date,
): PendingLogin | null {
  return open<PendingLogin>(vault, CONTEXT, sealed, state, now);
}

/**
 * Like `sealPendingLogin`, for the bot invite flow. It has its own encryption context, so an
 * invite cookie is never accepted as a pending login or the other way round.
 */
export function sealPendingInvite(vault: SecretVault, invite: PendingInvite): string {
  return seal(vault, INVITE_CONTEXT, invite);
}

/** Returns the pending invite when the cookie is authentic, fresh and matches `state`. */
export function openPendingInvite(
  vault: SecretVault,
  sealed: string,
  state: string,
  now: Date,
): PendingInvite | null {
  return open<PendingInvite>(vault, INVITE_CONTEXT, sealed, state, now);
}
