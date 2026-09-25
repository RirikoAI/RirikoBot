'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { ValidationError } from '@ririko/core';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
import { PASSKEY_REASON_MESSAGES, type PasskeyActionResult } from '@/lib/passkey-action-result';
import { enrollmentState } from '@/lib/server/auth/passkey-policy';
import { PasskeyVerificationError } from '@/lib/server/auth/passkeys';
import {
  getPasskeyCount,
  requireSession,
  requireStepUp,
  writeSessionCookie,
} from '@/lib/server/auth/session';
import { isDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

const PAGE = '/account/security';
const FOREIGN_ORIGIN: PasskeyActionResult<never> = {
  ok: false,
  error: 'This request did not come from the dashboard.',
};

async function checkEnrollment(): Promise<
  PasskeyActionResult<Awaited<ReturnType<typeof requireSession>>>
> {
  if (!(await isDashboardRequest())) return FOREIGN_ORIGIN;
  const session = await requireSession(PAGE);
  const state = enrollmentState(session, await getPasskeyCount(session.userId), Date.now());
  return state === 'ok'
    ? { ok: true, data: session }
    : { ok: false, error: PASSKEY_REASON_MESSAGES[state], reason: state };
}

export async function beginPasskeyRegistration(): Promise<
  PasskeyActionResult<PublicKeyCredentialCreationOptionsJSON>
> {
  const allowed = await checkEnrollment();
  if (!allowed.ok) return allowed;
  const session = allowed.data;
  const { passkeys, users } = await getWebServices();
  const user = await users.findById(session.userId);
  const options = await passkeys.registrationOptions(session, {
    name: user?.username ?? session.userId,
    displayName: user?.displayName ?? user?.username ?? 'Discord user',
  });
  return { ok: true, data: options };
}

/**
 * Stores the new passkey. Creating it proves the user holds it, so the session counts as
 * passkey-checked from now on and gets a new ID. The user gets a DM, so a passkey added with a
 * stolen session does not go unnoticed.
 */
export async function finishPasskeyRegistration(
  name: unknown,
  response: unknown,
): Promise<PasskeyActionResult> {
  const allowed = await checkEnrollment();
  if (!allowed.ok) return allowed;
  const { notifier, passkeys, sessions } = await getWebServices();
  const actor = await requestActor();
  let passkey;
  try {
    passkey = await passkeys.register(allowed.data, name, response, actor);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof PasskeyVerificationError) {
      return { ok: false, error: error.userMessage };
    }
    throw error;
  }
  const rotated = await sessions.completePasskeyCheck(allowed.data);
  await writeSessionCookie(rotated.token, rotated.session);
  const added = { name: passkey.name, context: { at: passkey.createdAt, ...actor } };
  after(() => notifier.passkeyAdded(allowed.data.userId, added.name, added.context));
  revalidatePath(PAGE);
  return { ok: true, data: null };
}

/** Removes a passkey; needs a passkey check from the last five minutes. The user gets a DM. */
export async function removePasskey(passkeyId: unknown): Promise<PasskeyActionResult> {
  if (!(await isDashboardRequest())) return FOREIGN_ORIGIN;
  if (typeof passkeyId !== 'string' || passkeyId.length > 1024) {
    return { ok: false, error: 'Unknown passkey.' };
  }
  const session = await requireSession(PAGE);
  const state = await requireStepUp(session);
  if (state !== 'ok') return { ok: false, error: PASSKEY_REASON_MESSAGES[state], reason: state };

  const { notifier, passkeys } = await getWebServices();
  const actor = await requestActor();
  const removed = await passkeys.remove(session.userId, passkeyId, actor);
  if (!removed) return { ok: false, error: 'Unknown passkey.' };
  const context = { at: new Date(), ...actor };
  after(async () =>
    notifier.passkeyRemoved(
      session.userId,
      removed.name,
      await passkeys.count(session.userId),
      context,
    ),
  );
  revalidatePath(PAGE);
  return { ok: true, data: null };
}
