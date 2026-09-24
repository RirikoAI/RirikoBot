import Link from 'next/link';
import { UserMenu } from '@/components/user-menu';
import { loginErrorMessage } from '@/lib/login-errors';
import { getCurrentUser } from '@/lib/server/auth/session';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ error }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const errorMessage = loginErrorMessage(error);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Ririko <span className="text-sakura">Dashboard</span>
      </h1>
      <p className="max-w-xl text-lg text-zinc-400">
        Configure Ririko AI for the Discord servers you manage.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <UserMenu user={user} />
          <Link
            href="/servers"
            className="rounded-md bg-sakura-strong px-5 py-2.5 font-semibold text-white hover:bg-sakura"
          >
            Choose a server
          </Link>
        </div>
      ) : (
        // A plain link: the login route redirects to Discord, which client-side routing cannot follow.
        <a
          href="/api/auth/login"
          className="rounded-md bg-[#5865F2] px-5 py-2.5 font-semibold text-white hover:bg-[#4752C4]"
        >
          Sign in with Discord
        </a>
      )}
    </main>
  );
}
