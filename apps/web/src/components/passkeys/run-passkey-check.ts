import { startAuthentication } from '@simplewebauthn/browser';
import { beginPasskeyCheck, finishPasskeyCheck } from '@/app/verify/actions';

/** Message for browser WebAuthn failures, most often the user closing the prompt. */
export function passkeyPromptError(error: unknown): string {
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'The passkey prompt was closed or timed out.';
  }
  return 'Your browser could not use a passkey here.';
}

/** Runs a passkey check in the browser. Returns an error message, or null on success. */
export async function runPasskeyCheck(): Promise<string | null> {
  const begin = await beginPasskeyCheck();
  if (!begin.ok) return begin.error;
  let response;
  try {
    response = await startAuthentication({ optionsJSON: begin.data });
  } catch (error) {
    return passkeyPromptError(error);
  }
  const finish = await finishPasskeyCheck(response);
  return finish.ok ? null : finish.error;
}
