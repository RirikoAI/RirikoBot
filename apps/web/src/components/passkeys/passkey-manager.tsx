'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  removePasskey,
} from '@/app/account/security/actions';
import type { PasskeyActionResult } from '@/lib/passkey-action-result';
import { LocalTime } from '../local-time';
import { passkeyPromptError, runPasskeyCheck } from './run-passkey-check';

export interface PasskeySummary {
  id: string;
  name: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Runs an action; when it asks for a passkey check, runs one and retries once. Returns the
 * final result or an error message.
 */
async function withPasskeyCheck<T>(
  action: () => Promise<PasskeyActionResult<T>>,
): Promise<PasskeyActionResult<T>> {
  const first = await action();
  if (first.ok || first.reason !== 'passkey-check-required') return first;
  const failure = await runPasskeyCheck();
  return failure ? { ok: false, error: failure } : action();
}

export function PasskeyManager({ passkeys }: { passkeys: PasskeySummary[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; signIn: boolean } | null>(null);

  async function addPasskey(event: FormEvent) {
    event.preventDefault();
    setPending('add');
    setError(null);
    const begin = await withPasskeyCheck(beginPasskeyRegistration);
    if (!begin.ok) {
      setError({ message: begin.error, signIn: begin.reason === 'recent-sign-in-required' });
      setPending(null);
      return;
    }
    let response;
    try {
      response = await startRegistration({ optionsJSON: begin.data });
    } catch (failure) {
      setError({ message: passkeyPromptError(failure), signIn: false });
      setPending(null);
      return;
    }
    const finish = await finishPasskeyRegistration(name, response);
    setPending(null);
    if (!finish.ok) {
      setError({ message: finish.error, signIn: finish.reason === 'recent-sign-in-required' });
      return;
    }
    setName('');
    router.refresh();
  }

  async function remove(passkey: PasskeySummary) {
    const last = passkeys.length === 1;
    const warning = last
      ? `Remove "${passkey.name}"? It is your last passkey, so signing in will only need Discord again and sensitive settings will be unavailable.`
      : `Remove "${passkey.name}"?`;
    if (!window.confirm(warning)) return;
    setPending(passkey.id);
    setError(null);
    const result = await withPasskeyCheck(() => removePasskey(passkey.id));
    setPending(null);
    if (!result.ok) {
      setError({ message: result.error, signIn: false });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {passkeys.length === 0 ? (
        <p className="rounded-lg border border-edge bg-panel p-4 text-sm text-zinc-300">
          You have no passkeys. Anyone who gets into your Discord account can use this dashboard.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-edge rounded-lg border border-edge bg-panel">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{passkey.name}</p>
                <p className="text-xs text-zinc-400">
                  {passkey.synced ? 'Synced passkey' : 'This device only'} · added{' '}
                  <LocalTime value={passkey.createdAt} />
                  {passkey.lastUsedAt ? (
                    <>
                      {' '}
                      · last used <LocalTime value={passkey.lastUsedAt} />
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(passkey)}
                disabled={pending !== null}
                className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-300 hover:bg-edge disabled:opacity-60"
              >
                {pending === passkey.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addPasskey} className="flex max-w-xl flex-col gap-2">
        <label htmlFor="passkey-name" className="text-sm font-medium text-zinc-200">
          Add a passkey
        </label>
        <div className="flex gap-2">
          <input
            id="passkey-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name, e.g. Laptop or Phone"
            maxLength={64}
            required
            className="w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-sakura"
          />
          <button
            type="submit"
            disabled={pending !== null}
            className="shrink-0 rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura disabled:opacity-60"
          >
            {pending === 'add' ? 'Waiting…' : 'Add passkey'}
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error.message}{' '}
          {error.signIn ? (
            // A plain link: the login route redirects to Discord.
            <a href="/api/auth/login?returnTo=%2Faccount%2Fsecurity" className="underline">
              Sign in again
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
