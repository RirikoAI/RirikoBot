'use server';

import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import type { PasskeyActionResult } from '@/lib/passkey-action-result';
import { PasskeyVerificationError } from '@/lib/server/auth/passkeys';
import { requireSessionForPasskeyCheck, writeSessionCookie } from '@/lib/server/auth/session';
import { checkDashboardRequest } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

/** Starts a passkey check (sign-in gate or step-up) for the signed-in user. */
export async function beginPasskeyCheck(): Promise<
  PasskeyActionResult<PublicKeyCredentialRequestOptionsJSON>
> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { ok: false, error: rejected };
  const session = await requireSessionForPasskeyCheck('/verify');
  const { passkeys } = await getWebServices();
  const options = await passkeys.authenticationOptions(session);
  return options
    ? { ok: true, data: options }
    : { ok: false, error: 'You have no passkey yet.', reason: 'passkey-required' };
}

/**
 * Verifies the passkey response. On success the session is marked as checked and gets a new ID
 * (and a new cookie), so a cookie copied before the check no longer works.
 */
export async function finishPasskeyCheck(response: unknown): Promise<PasskeyActionResult> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { ok: false, error: rejected };
  const session = await requireSessionForPasskeyCheck('/verify');
  const { passkeys, sessions } = await getWebServices();
  try {
    await passkeys.authenticate(session, response);
  } catch (error) {
    if (error instanceof PasskeyVerificationError) return { ok: false, error: error.userMessage };
    throw error;
  }
  const rotated = await sessions.completePasskeyCheck(session);
  await writeSessionCookie(rotated.token, rotated.session);
  return { ok: true, data: null };
}
