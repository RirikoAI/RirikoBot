/** Why a passkey action could not proceed, so the client can resolve it and retry. */
export type PasskeyActionReason =
  'passkey-check-required' | 'passkey-required' | 'recent-sign-in-required';

export type PasskeyActionResult<T = null> =
  { ok: true; data: T } | { ok: false; error: string; reason?: PasskeyActionReason };

export const PASSKEY_REASON_MESSAGES: Record<PasskeyActionReason, string> = {
  'passkey-check-required': 'Confirm it is you with your passkey first.',
  'passkey-required': 'Add a passkey to your account first.',
  'recent-sign-in-required':
    'For your first passkey, sign in with Discord again, then add it within 10 minutes.',
};
