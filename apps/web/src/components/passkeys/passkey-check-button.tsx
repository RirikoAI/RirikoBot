'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runPasskeyCheck } from './run-passkey-check';

/** Sign-in gate prompt: verifies the passkey, then continues to `returnTo`. */
export function PasskeyCheckButton({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setPending(true);
    setError(null);
    const failure = await runPasskeyCheck();
    if (failure) {
      setError(failure);
      setPending(false);
      return;
    }
    router.replace(returnTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={verify}
        disabled={pending}
        className="rounded-md bg-sakura-strong px-5 py-2.5 font-semibold text-white hover:bg-sakura disabled:opacity-60"
      >
        {pending ? 'Waiting for your passkey…' : 'Use my passkey'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
