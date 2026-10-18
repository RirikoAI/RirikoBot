import 'server-only';
import type { ActiveSession } from './session-service';

/** How recent a passkey check must be for sensitive writes and passkey changes. */
export const STEP_UP_WINDOW_MS = 5 * 60_000;
/** A first passkey can only be added this soon after a Discord sign-in. */
export const FIRST_PASSKEY_SIGN_IN_WINDOW_MS = 10 * 60_000;

/**
 * Sign-in gate (ADR-013 revision 2026-09-25): once a user has a passkey, a session is not usable
 * until it has passed a passkey check.
 */
export function needsPasskeyCheck(session: ActiveSession, passkeyCount: number): boolean {
  return passkeyCount > 0 && session.stepUpAt === null;
}

/**
 * - `ok`: a passkey check happened within the step-up window.
 * - `passkey-check-required`: the user has a passkey but must use it again.
 * - `passkey-required`: the user has no passkey, so sensitive writes are not available.
 */
export type StepUpState = 'ok' | 'passkey-check-required' | 'passkey-required';

export function stepUpState(
  session: ActiveSession,
  passkeyCount: number,
  now: number,
): StepUpState {
  if (passkeyCount === 0) return 'passkey-required';
  if (session.stepUpAt && now - session.stepUpAt.getTime() < STEP_UP_WINDOW_MS) return 'ok';
  return 'passkey-check-required';
}

/**
 * Adding a passkey. With a passkey already enrolled, a fresh passkey check is required (a stolen
 * cookie must not add the thief's passkey). The first passkey needs a recent Discord sign-in, so
 * a stolen older cookie cannot enroll a passkey and lock the real user out.
 */
export function enrollmentState(
  session: ActiveSession,
  passkeyCount: number,
  now: number,
): 'ok' | 'passkey-check-required' | 'recent-sign-in-required' {
  if (passkeyCount > 0) {
    return stepUpState(session, passkeyCount, now) === 'ok' ? 'ok' : 'passkey-check-required';
  }
  return now - session.createdAt.getTime() < FIRST_PASSKEY_SIGN_IN_WINDOW_MS
    ? 'ok'
    : 'recent-sign-in-required';
}
