import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountNav } from '@/components/account-nav';
import { PasskeyManager } from '@/components/passkeys/passkey-manager';
import { SiteHeader } from '@/components/site-header';
import { requireSession } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Security · Ririko Dashboard' };

export default async function SecurityPage() {
  const session = await requireSession('/account/security');
  const { passkeys } = await getWebServices();
  const list = await passkeys.list(session.userId);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Your servers
        </Link>
        <AccountNav current="/account/security" />
        <header>
          <h1 className="text-2xl font-bold">Passkeys</h1>
          <p className="mt-2 text-sm text-zinc-400">
            A passkey uses your fingerprint, face or device PIN. Once you add one, the dashboard
            asks for it every time you sign in, so someone who takes over your Discord account still
            cannot get in. Sensitive settings always need a passkey.
          </p>
        </header>
        <PasskeyManager
          passkeys={list.map((passkey) => ({
            id: passkey.id,
            name: passkey.name,
            synced: passkey.deviceType === 'multiDevice',
            createdAt: passkey.createdAt.toISOString(),
            lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
          }))}
        />
        <p className="text-xs text-zinc-500">
          Lost every passkey? A bot operator can reset them for you.
        </p>
      </main>
    </>
  );
}
