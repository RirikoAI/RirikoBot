import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PasskeyCheckButton } from '@/components/passkeys/passkey-check-button';
import { sanitizeReturnTo } from '@/lib/server/auth/request';
import { stepUpState } from '@/lib/server/auth/passkey-policy';
import { getPasskeyCount, requireSessionForPasskeyCheck } from '@/lib/server/auth/session';

export const metadata: Metadata = { title: 'Confirm it is you · Ririko Dashboard' };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(typeof rawReturnTo === 'string' ? rawReturnTo : null);
  const session = await requireSessionForPasskeyCheck(returnTo);
  // Used for both the sign-in gate and step-up, so only a recent check skips the prompt.
  const state = stepUpState(session, await getPasskeyCount(session.userId), Date.now());
  if (state !== 'passkey-check-required') redirect(returnTo);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Confirm it is you</h1>
      <p className="text-zinc-400">
        Your account is protected with a passkey. Use it to finish signing in.
      </p>
      <PasskeyCheckButton returnTo={returnTo} />
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="text-sm text-zinc-400 underline hover:text-zinc-200">
          Sign out
        </button>
      </form>
    </main>
  );
}
